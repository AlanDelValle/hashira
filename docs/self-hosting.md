# Self-hosting Hashira

Everything here is free software and none of it phones home. What follows is one machine, one
`docker compose up`, and the two jobs nobody can do for you: backing it up somewhere else, and
upgrading it.

## What you need

- A machine with Docker and about 2 GB of memory. A free-tier ARM instance is enough — Hashira
  runs on one, and the numbers in this file were taken there.
- A domain name pointed at it, if you want HTTPS. There is no other cost.
- Ports 80 and 443 reachable from the internet, which is what a certificate is issued against.

## Starting it

```bash
git clone https://github.com/AlanDelValle/hashira.git
cd hashira
cp .env.production.example .env
```

Open `.env` and set four things: `APP_URL` and `SERVER_NAME` to your domain, `DB_PASSWORD` to
something long, and `APP_KEY` to a key you generate:

```bash
docker compose run --rm --no-deps app php artisan key:generate --show
```

Paste that value — including the `base64:` prefix — into `APP_KEY`. Then:

```bash
docker compose up -d
```

The first start pulls the image, waits for PostgreSQL, runs the migrations and asks Let's
Encrypt for a certificate. Give it a minute and open your domain.

```bash
docker compose logs -f app       # what it is doing
docker compose ps                # healthy, once /up answers
```

### If you already have something terminating TLS

A load balancer, or Cloudflare with SSL set to Full: put `SERVER_NAME=:80` in `.env` instead of
your hostname. Caddy then serves plain HTTP and does not try to hold a certificate of its own.
Two things trying to hold the same one is the most common way this fails to come up.

## Turning on presence and live co-editing

Off by default. With `BROADCAST_CONNECTION=null` the browser is handed an empty key, never
opens a connection, and the editor is exactly what it is with the socket running, minus the
other people. That is deliberate: a drafting tool that will not start because a websocket
server is down is a worse tool than one that quietly has nobody else in it.

To turn it on, set in `.env`:

```
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=<any long random string>
REVERB_APP_KEY=<any long random string>
REVERB_APP_SECRET=<any long random string>
REVERB_CLIENT_HOST=hashira.example.com
```

The three credentials are a shared secret between PHP and the socket server — you invent them,
you do not look them up. Then start with the profile:

```bash
docker compose --profile presence up -d
```

Nothing new is published: the browser reaches the socket through the same 443 as everything
else, and the app container passes it on. One port, one certificate.

**Do not set `BROADCAST_CONNECTION=reverb` without starting that profile.** Broadcasting
happens inside the request that saved the edit, so every save would then spend a second waiting
for a connection that is refused. The edit survives — that is what `App\Support\Delivery` is
for — but the wait is real, and the log will say so on every one.

## Backups

The scheduler container runs `hashira:backup` nightly at 03:15, into the `backups` volume. It
writes two files, because two things hold work:

- `hashira-<date>.dump` — the drawings, as a `pg_dump` in custom format.
- `hashira-files-<date>.tar.gz` — the private disk: the PDFs somebody imported to trace over,
  and the blocks they saved.

A dump of either alone restores an instance missing half of what people put into it.

Run one now:

```bash
docker compose exec scheduler php artisan hashira:backup
docker compose exec app ls -lh /backups
```

Fourteen days are kept; `BACKUP_KEEP_DAYS` changes that.

### Getting them off the machine

**This part is yours and it is the part that matters.** A dump on the same disk as the database
is not a backup of that disk failing. Anything works — the point is that it leaves. For
example, nightly to an object store with [rclone](https://rclone.org):

```bash
docker run --rm -v hashira_backups:/backups -v ~/.config/rclone:/config/rclone \
  rclone/rclone sync /backups remote:hashira-backups
```

Put that in the host's crontab a little after 03:15 and check, once, that something arrived.
A backup nobody has ever restored is a hypothesis.

### Restoring

```bash
# Drawings.
docker compose exec app pg_restore --clean --if-exists \
  --host=postgres --username=hashira --dbname=hashira /backups/hashira-2026-09-07-031500.dump

# Files.
docker compose exec app tar -xzf /backups/hashira-files-2026-09-07-031500.tar.gz \
  -C /app/storage/app/private
```

`pg_restore` wants the password; it reads `PGPASSWORD` from the environment, which the
container already has.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

The app container runs `php artisan migrate --force` as it starts, so a schema change applies
itself. Take a backup first — that is not a formality while the project is before 1.0, because
Phase 10.2 rewrites how a project's owner is recorded.

Two things worth knowing:

- **Pin the version if you would rather decide when this happens.** `HASHIRA_VERSION` in `.env`
  takes a release tag instead of `latest`.
- **Read the release notes for anything before `v1.0.0`.** The schema is still moving, and a
  migration that needs a decision from you will say so there rather than making it for you.

### Rolling back

Set `HASHIRA_VERSION` to the previous tag and `docker compose up -d`. That returns the code and
not the database: a migration that has run has run. If the release notes say a migration is not
reversible, the way back is the backup you took before upgrading, which is the whole reason
this paragraph asks you to take one.

## Building the image yourself

The published image is built by CI from a tagged commit. To build your own:

```bash
docker compose build
```

It is the same Dockerfile. The difference is that a locally built image does not know which
version it is, so the footer's source link points at the repository rather than at a commit —
the AGPL asks that people using this over a network be offered the source of what is running,
and pointing them at the wrong commit would be worse than pointing at the project.

## Which parts are which

| Container   | What it is                         | Needed           |
| ----------- | ---------------------------------- | ---------------- |
| `app`       | The application and the web server | Yes              |
| `postgres`  | The drawings                       | Yes              |
| `scheduler` | Nightly backups                    | Strongly advised |
| `reverb`    | Presence and live co-editing       | Optional         |

There is no queue worker, and that is not an omission: nothing in this application is queued
today, so `QUEUE_CONNECTION=sync` is the honest setting and a container waiting on an empty
table is one more thing to keep alive for no reason.

## When it will not start

**`APP_KEY is empty.`** The container says this and stops, on purpose — without it every
sign-in fails with an error that does not mention the cause. Generate one as above.

**The certificate will not issue.** Caddy needs ports 80 and 443 reachable from the internet,
and the domain has to resolve to this machine already. Check with `docker compose logs app`;
Let's Encrypt's own error is usually in there verbatim. If you are behind Cloudflare, set the
SSL mode to Full — Flexible makes Cloudflare talk HTTP to a server that is expecting HTTPS, and
the result is a redirect loop rather than an error.

**`The database did not answer after 60 seconds.`** PostgreSQL did not come up. `docker compose
logs postgres` — the usual cause is a `DB_PASSWORD` changed after the data directory was
created, which does not update the password inside it.

**`php artisan db:show` fails with "The intl PHP extension is required".** It does, and only
that command does. The image leaves `intl` out because nothing the application serves needs it,
and carrying it would add about a third again to what everybody pulls for one diagnostic.
`php artisan about` and `php artisan migrate:status` both work; so does
`docker compose exec app pg_isready -h postgres -U hashira`, which is what the container itself
uses to decide the database is up.

**A free-tier instance stopped on its own.** Oracle's always-free tier reclaims instances that
sit under 10% CPU and network for seven days. A health check on a cron every few minutes is
enough to keep it, and doubles as monitoring.
