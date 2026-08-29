<h1>Hashira</h1>

**Design spaces. Precisely.**

A free and open-source 2D design tool for floor plans, interiors and technical drawings —
in the browser.

> **Status: early development.** Phase 0 (architecture and specification) is complete.
> The editor is being built in the open, phase by phase — see the [roadmap](docs/roadmap.md).
> This README documents what the project is and how it is put together; it does not yet
> describe a finished product.

---

## What it is

Hashira is a drafting tool, not a diagram editor. Walls have thickness and produce real
poché. Doors and windows belong to a wall and cut an opening in it. Everything is measured
in millimetres and can be set by typing an exact value, not only by dragging. Drawings
export as vectors at a real scale on a real page size.

It is deliberately small. There is no 3D, no BIM, no AI, no DWG. There is one thing —
drawing an accurate 2D plan — done properly.

## Screenshots

_Coming with Phase 2, when there is an editor worth photographing. Placeholder images are
worse than none._

## Stack

| | |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Editor core | Plain TypeScript — no React in the document, geometry or command layers |
| Rendering | Canvas 2D for the viewport; independent serializers for SVG, PNG and PDF export |
| Backend | Laravel 13, PHP 8.4, REST, Sanctum (stateful cookie auth) |
| Database | PostgreSQL — relational metadata, JSONB for the drawing itself |
| Tests | Vitest + Testing Library, Pest, Playwright |
| CI | GitHub Actions |

Local development targets [Laravel Herd](https://herd.laravel.com), which already provides
PHP, Nginx and PostgreSQL. Containers are on the roadmap for self-hosting, not required to
contribute.

## Running it locally

**Requirements:** Laravel Herd (PHP 8.3+), Node 22+, PostgreSQL 15+.

```bash
git clone https://github.com/AlanDelValle/hashira.git
cd hashira
composer install
npm install
cp .env.example .env
php artisan key:generate
```

Create the database and point `.env` at it:

```bash
createdb hashira
```

```dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=hashira
DB_USERNAME=postgres
DB_PASSWORD=
```

Then:

```bash
php artisan migrate --seed
npm run dev
```

Herd serves the directory automatically at `https://hashira.test`. Without Herd,
`php artisan serve` works the same way at `http://localhost:8000` — set `APP_URL` to match.

The seeder creates a demo account and a sample plan:

```
demo@hashira.test  ·  password
```

## Architecture

The full reasoning lives in [`docs/architecture.md`](docs/architecture.md). The short
version is one rule:

> The drawing is not React state. The document, the geometry and the commands that mutate
> it are plain TypeScript. React renders the chrome around the drawing; it never owns it.

Which gives:

- a document model that is serialisable, versioned and testable without a DOM —
  [`docs/document-format.md`](docs/document-format.md);
- a command layer that makes undo/redo correct by construction rather than by remembering
  to snapshot;
- a snapping engine that is a single pipeline stage, not logic scattered through components;
- a canvas renderer where dragging a wall across a large plan causes zero React renders.

Documentation index:

| Document | What is in it |
|---|---|
| [architecture.md](docs/architecture.md) | System shape, the decisions and why they were made |
| [document-format.md](docs/document-format.md) | The drawing schema, versioning and migration rules |
| [data-model.md](docs/data-model.md) | Database tables and the REST API surface |
| [roadmap.md](docs/roadmap.md) | Phases, MVP scope and everything deliberately deferred |

## Roadmap

Phase 0 discovery is done. Phase 1 builds the foundation (auth, dashboard, CI); Phases 2–3
build the editor itself; Phases 4–6 add history, persistence, export, sharing and polish.
Collaboration, DXF, plugins and 3D are recorded as later phases so they stay out of the
MVP. Details in [`docs/roadmap.md`](docs/roadmap.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and
the code standards, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for how we treat each
other. Good first issues are labelled as such once Phase 1 lands.

## Licence

[MIT](LICENSE).

MIT was chosen over a copyleft licence such as AGPL deliberately. The value of this project
is the tool and the people who improve it, not licence leverage over people who host it.
Permissive licensing also means the editor core — the geometry, document and command
layers — can be lifted into other projects without a legal conversation, which is the most
useful thing this codebase can offer. If the project ever grows a hosted commercial edition,
that is a reason to add a separate licence for that edition, not to restrict this one.

## Name

*Hashira* (柱) is the Japanese word for a structural pillar or column — the vertical member
that holds a building up, and the reference line everything else in a traditional plan is
set out from. The alternatives considered were *Poché*, *Parti*, *Datum* and *Planum*; the
reasoning is in [`docs/architecture.md`](docs/architecture.md). The name is provisional.

## Acknowledgements

Hashira is an independent project. It is inspired by the general direction of modern
browser-based design tools, but it is not affiliated with, derived from, or a clone of any
of them.
