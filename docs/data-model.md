# Data model and API

## 1. Database

PostgreSQL. Identifiers are **ULIDs** for everything a URL or a client can reference
(projects, documents, versions, share links) — sortable by creation time, opaque enough not
to leak counts. `users` keeps Laravel's auto-increment key, because nothing exposes it.

```
users
  id                bigint pk
  name              varchar
  email             varchar unique
  password          varchar
  timestamps, remember_token

projects
  id                ulid pk
  user_id           bigint fk → users, cascade delete
  name              varchar(120)
  description       text null
  archived_at       timestamptz null
  timestamps
  index (user_id, updated_at desc)

documents
  id                ulid pk
  project_id        ulid fk → projects, cascade delete
  name              varchar(120)
  schema_version    smallint
  revision          integer default 0        -- optimistic concurrency
  data              jsonb                    -- the drawing, see document-format.md
  timestamps
  index (project_id)

document_versions
  id                ulid pk
  document_id       ulid fk → documents, cascade delete
  label             varchar(120) null
  schema_version    smallint
  revision          integer                  -- the document revision captured
  data              jsonb
  created_by        bigint fk → users, null on delete
  created_at        timestamptz
  index (document_id, created_at desc)

share_links
  id                ulid pk
  project_id        ulid fk → projects, cascade delete
  token             char(43) unique          -- 32 random bytes, base64url
  role              varchar(16)              -- 'viewer' | 'commenter' | 'editor'
  expires_at        timestamptz null
  revoked_at        timestamptz null
  last_viewed_at    timestamptz null
  view_count        integer default 0
  created_by        bigint fk → users, null on delete
  timestamps
  unique (token)

project_members
  id                ulid pk
  project_id        ulid fk → projects, cascade delete
  user_id           bigint fk → users, cascade delete
  role              varchar(16)              -- 'commenter' | 'editor'; viewing is not recorded
  share_link_id     ulid fk → share_links, null on delete   -- which link let them in
  joined_at         timestamptz
  timestamps
  unique (project_id, user_id)
  index (user_id)

comment_threads
  id                  ulid pk
  project_id          ulid fk → projects, cascade delete
  x                   double precision        -- millimetres of drawing, like the document
  y                   double precision
  element_id          varchar(64) null        -- what the pin was dropped on, if anything
  opening_comment_id  ulid null               -- which remark the pin was dropped for
  resolved_at         timestamptz null
  resolved_by         bigint fk → users, null on delete
  created_by          bigint fk → users, null on delete
  timestamps
  index (project_id, resolved_at)

comments
  id                ulid pk
  thread_id         ulid fk → comment_threads, cascade delete
  user_id           bigint fk → users, null on delete
  body              text
  timestamps
  index (thread_id, created_at)

comment_mentions
  id                ulid pk
  comment_id        ulid fk → comments, cascade delete
  user_id           bigint fk → users, null on delete
  text              varchar(160)            -- the '@…' exactly as it was typed
  timestamps
  unique (comment_id, user_id)
  index (user_id)

underlays
  id                ulid pk
  project_id        ulid fk → projects, cascade delete
  name              varchar(160)             -- the file it came out of
  page              smallint                 -- which page of it
  width             integer                  -- the page's own size, in millimetres
  height            integer
  path              varchar(255)             -- on the private disk, never public
  bytes             integer
  timestamps
  index (project_id)

blocks
  id                ulid pk
  user_id           bigint fk → users, cascade delete
  name              varchar(80)
  category          varchar(32)              -- one of the library's seven
  width             integer                  -- millimetres, the size it is placed at
  height            integer
  draw              jsonb                    -- primitives in a normalised 0–1 box
  timestamps
  index (user_id)
```

Notes on the shape:

- **A project has many documents**, but the MVP UI creates and uses exactly one. The
  relation exists so multi-sheet projects are a feature, not a migration.
- **`documents.data` is JSONB, not a table of elements.** The reasoning is in
  [architecture.md §2.8](architecture.md). JSONB keeps the door open: `data -> 'elements'`
  is queryable and indexable if a future feature needs it.
- **`revision` is the concurrency guard.** Every write increments it; a client that saves
  against a stale revision gets `409 Conflict` rather than clobbering another tab.
- **Share tokens are 32 bytes from a CSPRNG**, never derived from an id. Revocation is a
  timestamp, not a delete, so a leaked link can be audited after the fact.
- **A link's role decides whether it can be taken up at all.** `viewer` is the whole of
  anonymous access and records nobody. `commenter` and `editor` cannot be used without
  signing in, and accepting one writes a `project_members` row — after which the token is
  never consulted again and every answer comes from the policy reading that row.
- **A membership outlives the link that wrote it.** `share_link_id` is kept for the audit and
  nulled rather than cascaded, because issuing a fresh link revokes the previous one and must
  not evict the people already working. Closing the door and showing somebody out are two
  different acts, and they have two different controls.
- **A comment is not in the drawing.** It gets its own tables rather than a place in
  `documents.data`, because it is not a thing anybody drew: in the document it would be
  dragged into undo, into every export, into the share payload and into the version
  comparison, and the schema would have to move every time the conversation about a plan
  changed shape.
- **A pin does not follow the geometry.** `x` and `y` are where somebody pointed, and they
  stay there. `element_id` records what was under the click so a thread can say the thing it
  was about has been deleted — moving the pin when a wall moves would re-point what somebody
  said.
- **Which remark opened a thread is recorded, not worked out.** `opening_comment_id` exists
  because the alternative is "the oldest comment", and two rows written in the same
  millisecond tie on `created_at` with ULIDs breaking the tie at random. It is the same
  mistake as deciding which face of a wall is inside from the order it was drawn in.
- **A mention is a row, not a re-scan.** The roster changes: somebody removed from a project
  tomorrow was still addressed today. `text` is what was actually typed, kept beside the id so
  that highlighting cannot quietly rewrite last month's conversation when a person renames
  their account.
- **An underlay belongs to a project, not to a person.** A survey is imported to draw one
  particular building on top of. Deleting the project deletes the pictures as well as the
  rows: a foreign key cascade has never deleted a file.
- **A block belongs to a person, not to a project.** A drawing refers to it by id and never
  copies its geometry, which is what keeps drawings small — and is why the document endpoints
  serve the blocks a drawing refers to along with it. There is no update: correcting a block
  means drawing it again, so a plan finished months ago cannot change under someone.

## 2. API

All routes under `/api` are JSON, run on the `web` middleware group (browser session plus
CSRF — see [architecture.md §2.1](architecture.md)), and are authorized by policy. Ownership
is always checked against the authenticated user, never inferred from the request body.

### Authentication

```
POST   /api/register
POST   /api/login
POST   /api/logout
POST   /api/forgot-password
POST   /api/reset-password
GET    /api/user
```

### Projects

```
GET    /api/projects                    list the caller's projects, newest activity first
POST   /api/projects                    { name }
GET    /api/projects/{project}
PATCH  /api/projects/{project}          { name?, description? }
DELETE /api/projects/{project}
POST   /api/projects/{project}/duplicate
```

### Underlays

```
GET    /api/projects/{project}/underlays                    the project's imported pages
POST   /api/projects/{project}/underlays                    multipart: the rasterised page
GET    /api/projects/{project}/underlays/{underlay}/image   the picture, behind the policy
DELETE /api/projects/{project}/underlays/{underlay}
```

The page arrives already rasterised, because the browser has a PDF renderer and putting one
on the server would mean Ghostscript or Imagick on every machine that runs this. The picture
is served by a controller rather than from a public path: an underlay is usually somebody
else's survey, and sharing a drawing hands out the drawing, not the document it was traced
from.

### Blocks

```
GET    /api/blocks                      the caller's own blocks, by name
POST   /api/blocks                      { name, category, width, height, draw }
DELETE /api/blocks/{block}
```

`draw` is checked primitive by primitive rather than only at the envelope, unlike a document:
a block is drawn on other people's sheets, because a share link serves the blocks a drawing
uses along with the drawing.

### Document

```
GET    /api/projects/{project}/document       → { id, revision, schemaVersion, drawing, blocks }
PUT    /api/projects/{project}/document       { revision, data } → 200 | 409 Conflict
```

`PUT` is the autosave endpoint. It validates `schemaVersion`, rejects payloads over a size
ceiling, and returns the new `revision`.

The document JSON is called `drawing` in responses, not `data`. Laravel skips its own `data`
envelope for any resource whose payload already contains that key, which would silently leave
these two endpoints shaped differently from every other one. Requests still send it as `data`,
matching the validation rule name.

### Comments

```
GET    /api/projects/{project}/comments                    threads, open ones first
POST   /api/projects/{project}/comments                    { x, y, elementId?, body } → a thread
                                                           and the remark it was opened with
PATCH  /api/projects/{project}/comments/{thread}           { resolved }
DELETE /api/projects/{project}/comments/{thread}           takes its comments with it

POST   /api/projects/{project}/comments/{thread}/replies   { body }
DELETE /api/projects/{project}/comments/{thread}/replies/{comment}
```

Reading needs `view`; saying anything needs `comment`. Deleting a thread or one remark is kept
to its author and the project's owner. The remark a thread was opened with cannot be deleted
on its own — that answers `409`, because a place with answers to a question nobody can read is
worse than no pin at all; delete the thread instead.

Mentions are resolved on the server, when a remark is written, by matching a roster name
after an `@` — longest first, so "Ana Paula" is not read as "Ana". Each comment comes back
with the people it named and the exact text that named them, and the client highlights those
strings rather than parsing for itself: two copies of one matching rule is how the picture and
the record end up disagreeing about who was addressed. An `@` that names nobody on the project
stays plain text, which is what "the door is at @900mm" needs.

Nothing is delivered yet. Telling somebody they were named is a question of what carries it —
mail, or something live in the page — and that is the same delivery problem as presence, so it
waits for the socket in 9.1.

Replying to a resolved thread is allowed on purpose: "that is not quite right" is exactly what
somebody needs to say about a point that was closed too early.

### Versions

```
GET    /api/projects/{project}/versions       metadata only, never the payload
POST   /api/projects/{project}/versions       { label? } snapshots the current document
GET    /api/projects/{project}/versions/{version}
```

### Sharing

```
GET    /api/projects/{project}/share          the active link, if any
POST   /api/projects/{project}/share          { expiresAt?, role? } issues a token, revoking prior ones
DELETE /api/projects/{project}/share          revokes

POST   /api/share/{token}/accept              takes up a commenter or editor link; answers with
                                              the project. Behind `auth`, unlike the endpoint
                                              that serves the drawing
GET    /api/projects/{project}/people         who can be mentioned: names and ids, for
                                              anybody who can open the project
GET    /api/projects/{project}/members        who has joined — owner only
DELETE /api/projects/{project}/members/{member}
                                              removes one. The owner may remove anybody; anybody
                                              may remove themselves
```

`accept` answers `404` for a viewer link exactly as it does for an unknown one: a caller
learns nothing by asking, and a link that offers only viewing has nothing to take up.

### Presence

```
POST   /broadcasting/auth                     who may listen to a channel
```

One channel, `presence-project.{project}`, authorized in `routes/channels.php` by the same
`view` policy every other route asks. It answers with an id and a name — what every other
member of the channel is handed about this person, and the same shape `/people` serves for the
same reason.

**Cursors do not come through the server at all.** They are client events, whispered between
the browsers already on the channel: a pointer moves tens of times a second, and putting that
through PHP would be a queue of work for something stale before it is read. The server's whole
part in a cursor is having decided, once, who is allowed on the channel. Nothing in the
application broadcasts from PHP, which is why nothing here needs a queue worker.

### Public

```
GET    /share/{token}                         the read-only viewer page
GET    /api/share/{token}                     { name, schemaVersion, drawing, blocks, role } — no more
```

The public endpoint is deliberately a different controller with its own resource. It never
touches the project or user models in its response, is rate limited, and returns `404` —
not `403` — for revoked or expired tokens, so a probe cannot distinguish "wrong token" from
"revoked token". It serves the drawing read-only whatever role the link carries, including to
somebody who is signed in — `role` is there so the page can offer to take the link up, not
because the link is doing anything more. The single field it says about the project is one
the reader is already holding in their address bar.

### Conventions

- **Form Requests** for validation, **API Resources** for every response shape.
- **Policies** for `view`, `update`, `comment`, `delete`, `share` and `manageMembers` on
  `Project` and `delete` on `Block`; documents, versions, underlays and members all authorize
  through their project. There are two ways to pass: owning the project, or holding a
  membership row in it. A caller with neither is told `404`, so a project id reveals nothing;
  a member who simply may not do this particular thing is told `403`, because pretending the
  drawing on their screen does not exist would be a lie they can see through.
- Errors are Laravel's standard problem shapes: `422` validation with field paths, `403`
  authorization, `404` for anything the caller may not know exists, `409` for stale saves.
- Rate limits: authentication endpoints per email plus IP; the public share endpoint per IP.
