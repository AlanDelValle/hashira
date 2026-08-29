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

## 2. API

All routes under `/api` are JSON, session-authenticated via Sanctum's stateful guard, and
authorized by policy. Ownership is always checked against the authenticated user — never
inferred from the request body.

### Authentication

```
POST   /register
POST   /login
POST   /logout
POST   /forgot-password
POST   /reset-password
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

### Document

```
GET    /api/projects/{project}/document       → { id, revision, schemaVersion, data }
PUT    /api/projects/{project}/document       { revision, data } → 200 | 409 Conflict
```

`PUT` is the autosave endpoint. It validates `schemaVersion`, rejects payloads over a size
ceiling, and returns the new `revision`.

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
GET    /api/share/{token}                     { name, schemaVersion, data } and nothing else
```

The public endpoint is deliberately a different controller with its own resource. It never
touches the project or user models in its response, is rate limited, and returns `404` —
not `403` — for revoked or expired tokens, so a probe cannot distinguish "wrong token" from
"revoked token".

### Conventions

- **Form Requests** for validation, **API Resources** for every response shape.
- **Policies** for `view`, `update`, `delete`, `share` on `Project`; documents and versions
  authorize through their project.
- Errors are Laravel's standard problem shapes: `422` validation with field paths, `403`
  authorization, `404` for anything the caller may not know exists, `409` for stale saves.
- Rate limits: authentication endpoints per email plus IP; the public share endpoint per IP.
