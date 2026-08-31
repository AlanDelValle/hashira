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
  role              varchar(16)              -- 'viewer' today; 'commenter' | 'editor' later
  expires_at        timestamptz null
  revoked_at        timestamptz null
  last_viewed_at    timestamptz null
  view_count        integer default 0
  created_by        bigint fk → users, null on delete
  timestamps
  unique (token)

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

### Versions

```
GET    /api/projects/{project}/versions       metadata only, never the payload
POST   /api/projects/{project}/versions       { label? } snapshots the current document
GET    /api/projects/{project}/versions/{version}
```

### Sharing

```
GET    /api/projects/{project}/share          the active link, if any
POST   /api/projects/{project}/share          { expiresAt? } issues a token, revoking prior ones
DELETE /api/projects/{project}/share          revokes
```

### Public

```
GET    /share/{token}                         the read-only viewer page
GET    /api/share/{token}                     { name, schemaVersion, drawing, blocks } — no more
```

The public endpoint is deliberately a different controller with its own resource. It never
touches the project or user models in its response, is rate limited, and returns `404` —
not `403` — for revoked or expired tokens, so a probe cannot distinguish "wrong token" from
"revoked token".

### Conventions

- **Form Requests** for validation, **API Resources** for every response shape.
- **Policies** for `view`, `update`, `delete`, `share` on `Project` and `delete` on `Block`;
  documents and versions authorize through their project.
- Errors are Laravel's standard problem shapes: `422` validation with field paths, `403`
  authorization, `404` for anything the caller may not know exists, `409` for stale saves.
- Rate limits: authentication endpoints per email plus IP; the public share endpoint per IP.
