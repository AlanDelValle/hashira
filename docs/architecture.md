# Architecture

> Status: living document. Started at Phase 0, updated as each phase lands.

Hashira is a browser-based 2D drafting tool for floor plans, interiors and technical
drawings. This document explains how it is put together and, more importantly, _why_.

---

## 1. Shape of the system

```
┌───────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│                                                               │
│   React (UI shell)          Editor core (plain TypeScript)    │
│   ├── Landing               ├── model      document + types   │
│   ├── Auth                  ├── geometry   pure math          │
│   ├── Dashboard             ├── viewport   world <-> screen   │
│   └── Editor chrome ───────▶├── commands   undo/redo          │
│       toolbar, panels,      ├── tools      input state machs  │
│       status bar            ├── snapping   snap engine        │
│                             ├── render     canvas painter     │
│                             └── export     svg / png / pdf    │
│                                     │                         │
│                             persistence (autosave, api client)│
└─────────────────────────────────────┼─────────────────────────┘
                                      │ REST + session cookie
┌─────────────────────────────────────┼─────────────────────────┐
│  Laravel                            ▼                         │
│   Http (Controllers, Requests, Resources, Policies)           │
│   Domain                                                      │
│    ├── Projects   Project model + actions                     │
│    ├── Documents  Document, DocumentVersion, schema guard     │
│    └── Sharing    ShareLink, token issuing/revocation         │
│                                      │                        │
│                          PostgreSQL (relational + JSONB)      │
└───────────────────────────────────────────────────────────────┘
```

The single most important structural rule:

> **The drawing is not React state.** The document, the geometry and the commands that
> mutate them are plain TypeScript with no React import anywhere. React renders the
> _chrome_ around the drawing and reads the document; it never owns it.

Everything else in this document follows from that rule.

The line down the middle of that diagram is also where the bundle is cut. The landing page
and the sign-in screens are what an unknown visitor loads first and have no business paying
for a drawing editor they may never open, so every route that reaches into `editor/` is a
dynamic import. The first load is 282 kB rather than 559 kB; the canvas, the tools, the
snapping engine and the exporters arrive when a drawing does.

---

## 2. Decisions and why

### 2.1 SPA + REST, not Inertia — and session auth, not tokens

The brief calls for a REST API, a public read-only share route and an autosaving editor.
Inertia is excellent for CRUD-shaped apps, but here the client is a long-lived editor that
talks to a handful of resource endpoints (`GET/PUT document`, `POST version`,
`POST share`). Introducing a page-props protocol on top of that would blur an API boundary
we actually want explicit and testable.

So: one Blade shell boots a React SPA; all data moves over `/api/*`.

The API is served by the same application, on the same origin, to the same browser session
as the pages — so it runs on Laravel's **`web` middleware group**: real session
authentication and real CSRF verification. Sanctum was tried first and then removed. Its
stateful mode exists to bridge a _separately hosted_ SPA, and it decides whether to start a
session by sniffing the `Origin`/`Referer` header against a configured domain list. For an
SPA this application serves itself, that is a conditional session for no benefit and one more
thing to misconfigure. Password reset uses Laravel's built-in broker.

There is therefore no token anywhere: no bearer header to attach, nothing in `localStorage`,
and no CORS configuration. The client's one piece of bookkeeping is mirroring the
`XSRF-TOKEN` cookie into the `X-XSRF-TOKEN` header.

### 2.2 Canvas 2D for the viewport, an independent serializer for export

The two realistic options were an SVG scene graph rendered by React, or an imperative
Canvas 2D renderer.

SVG loses on the requirement that matters most: dragging a wall across a 400-element plan
must not re-run React reconciliation at 120 Hz. Keeping SVG fast would mean fighting React
with memo boundaries and refs until it was, effectively, an imperative renderer with extra
steps.

So the viewport is **Canvas 2D**, driven by a `requestAnimationFrame` loop that reads the
stores imperatively. React never renders during a drag.

Export is then _not_ "screenshot the DOM". The document is turned into a scene of primitives
once, and four outputs consume it — so the screen and a PDF cannot disagree about what a wall
with a door in it looks like:

```
document ──▶ scene ──┬──▶ canvas          the screen
                     ├──▶ canvas @ N×     PNG
                     ├──▶ SVG string      vector, layers intact
                     └──▶ pdf-lib page    a real page at a real scale
```

The scene carries line weight as _intent_ rather than as a number: every stroke is a pen
weight, a width on the finished sheet, and each output converts it its own way — which is why
a hairline stays a hairline at any zoom and still plots at 0.25 mm. Anything with a real
dimension is an area rather than a stroke: a wall's poché is 150 mm because the wall is, so it
is a filled shape and shrinks with the drawing.

The cost of this choice is that hit-testing is ours to write. That cost is not really new:
snapping needs point-to-segment distance, polygon containment and intersection math
regardless, so the `geometry` module pays for selection and snapping at the same time.

### 2.3 Millimetres are the only unit in storage

Every coordinate, length and thickness in the document is a number of **millimetres**.
`settings.unit` (`mm | cm | m`) is a _display_ preference; it changes formatting and input
parsing, never stored values. Switching display units is therefore lossless and cannot
accumulate float drift.

Pixels never appear in the document model. The only place pixels exist is the viewport
transform (§3).

### 2.4 Commands own every mutation

There is exactly one way to change the document:

```ts
interface Command {
  readonly label: string;
  readonly coalesceKey: string | null;
  execute(document: HashiraDocument): HashiraDocument;
  undo(document: HashiraDocument): HashiraDocument;
}
```

Both halves are pure functions returning a _new_ document rather than mutating one, so a
command can be replayed, inspected, or sent over a wire without carrying hidden state.

`HistoryStack` executes, pushes, and can pop. Nothing else writes to the document — not a
React handler, not a tool, not the properties panel. Undo/redo is therefore correct by
construction rather than by remembering to snapshot, and the same commands are the natural
seam for future collaboration and for a scripting/plugin API.

Three commands cover every edit so far: `addElements`, `deleteElements` and
`replaceElements` — a move, a rotation and a property edit are all the last one.

Edits sharing a `coalesceKey` and arriving within 600 ms merge into one history entry, so
holding an arrow key produces a single undo step rather than sixty. The merged command keeps
the original `before`, which is what makes that undo return to where the edit began.

### 2.5 Four kinds of state, deliberately separated

| State                | Lives in                    | Changes on             | Who reads it               |
| -------------------- | --------------------------- | ---------------------- | -------------------------- |
| **Document**         | `documentStore` (Zustand)   | command execution only | renderer, panels, autosave |
| **Viewport**         | `viewportStore`             | zoom / pan             | renderer, status bar       |
| **Selection & tool** | `editorStore`               | click, keypress        | renderer, panels, toolbar  |
| **Interaction**      | plain object, _not_ a store | every pointer move     | renderer only              |

Interaction state — the rubber band, the in-progress wall, the active snap indicator — is
deliberately outside React and outside Zustand. It is mutated directly and read by the next
animation frame. A drag produces **zero** React renders; on pointer-up a single command
runs and the panels update once.

Zustand is used as a subscription container, not as the model: the document is a plain data
structure that happens to be held in a store, so it stays serialisable and testable without
a DOM.

### 2.6 Snapping is a layer, not a feature sprinkled around

```
pointer event → screen point → world point → SnapEngine → snapped point → tool → command
```

Only grid snapping exists today; the engine below is what Phase 3 builds, and the pipeline is
already shaped for it — tools receive a `snap` function rather than reaching for the grid.

`SnapEngine` takes a world point plus context (the document, the viewport scale, which
element is being edited) and returns the best candidate together with its kind, so the
renderer can draw the right indicator. Providers are independent and ordered by priority:

`endpoint → midpoint → intersection → axis alignment → grid`

Tolerance is expressed in **screen pixels** and converted to world units using the current
zoom, so snapping feels identical at every zoom level. No React component ever contains
snapping logic.

### 2.7 Openings are hosted, not floating

A door or window is not a rectangle that happens to sit on a wall. It stores `hostId` and a
distance along that wall; the renderer subtracts the opening from the wall's poché when
painting. Move the wall and the opening follows; drag the opening and it slides along the
wall it belongs to. This is a small amount of code that produces most of the "this is a real
drafting tool" feeling.

### 2.8 The document is one JSONB column

Storing each element as a row would buy nothing in the MVP — there is no per-element query,
no per-element permission and no partial fetch — while making every save a diff problem.
The document is stored as `documents.data` (JSONB) with `schema_version` alongside it.

PostgreSQL is chosen over SQLite/MySQL specifically because JSONB gives us indexable,
queryable structure if and when we need to extract entities (`data -> 'elements'`), so this
decision is reversible rather than a dead end.

Saves are **optimistically concurrent**: `documents.revision` increments on every write and
the client sends the revision its edit was based on. A mismatch returns `409` instead of
silently overwriting a newer version saved from another tab.

### 2.9 Domain folders, but only where there is domain

```
app/
├── Domain/
│   ├── Projects/    Project model, CreateProject, DuplicateProject, DeleteProject
│   ├── Documents/   Document, DocumentVersion, SaveDocument, CreateDocumentVersion
│   └── Sharing/     ShareLink, IssueShareLink, RevokeShareLink
├── Http/            Controllers, Requests, Resources
├── Policies/
└── Models/          User (stays where Laravel expects it)
```

Actions exist where there is real logic: duplicating a project must deep-copy its document;
issuing a share link must generate an unguessable token and revoke prior ones. Anything
that is genuinely a two-line CRUD call stays in the controller. We are not adding a service
class per endpoint for symmetry.

---

## 3. Coordinate systems

Three spaces, never mixed:

- **World** — millimetres, Y grows downward, origin at the plan origin. The document lives here.
- **Screen** — CSS pixels inside the canvas element.
- **Device** — screen × `devicePixelRatio`, used only when sizing the canvas backing store.

The viewport is `{ x, y, zoom }` where `zoom` is screen pixels per millimetre:

```
screen = (world - offset) * zoom
world  = screen / zoom + offset
```

Every conversion goes through `viewport.toWorld()` / `viewport.toScreen()`. Ad-hoc
arithmetic on coordinates inside a component is treated as a bug.

Drawing **scale** (1:50, 1:100) is a separate concept: it affects export page geometry and
the printed scale bar, not on-screen zoom.

---

## 4. Rendering

One `<canvas>`, one rAF loop, painted in a fixed order:

```
1. paper / sheet background
2. grid              (adaptive: subdivisions fade out as you zoom away)
3. document elements, in layer order, hidden layers skipped
4. selection outlines and transform handles
5. active-tool preview (in-progress wall, rubber band)
6. snap indicator
7. dimension and measurement overlay
```

The loop paints only when something is marked dirty, so an idle editor costs nothing.
Layers 1–3 come from the document; 4–7 come from interaction state, which is why they can
update at pointer rate without touching React.

---

## 5. Persistence and autosave

```
command executed → document dirty → debounce 1.2 s (10 s hard ceiling)
                 → PUT /api/projects/{id}/document  { revision, data }
                 → status: Editing… / Saving… / Saved
```

The editor stays fully interactive during a save; an in-flight request never blocks input,
and only one request is ever outstanding — edits made during a save go out in one further
request afterwards rather than one per edit.

Failures surface in the header and retry with a growing delay. A **conflict is different from
a failure**: a 409 means `documents.revision` moved, so the drawing was saved somewhere else
and retrying would overwrite that work. Autosave stops there and offers a reload rather than
deciding on the user's behalf whose version wins.

`Ctrl/Cmd+S` forces an immediate flush, and versions can be created on demand
(`document_versions`). Restoring one goes through a command, so it is undoable like anything
else.

---

## 6. Testing strategy

Testing effort follows risk, not coverage percentage.

- **Pure unit tests (Vitest)** — geometry, snapping, unit parsing/formatting, command
  execute/undo round-trips, document migrations. Cheap, fast, and where the real bugs live.
- **Component tests (Testing Library)** — properties panel editing, layer panel, shortcuts.
- **Feature tests (Pest)** — authorization above all: a user must not read or write another
  user's project; a share token exposes the shared document and nothing else.
- **E2E (Playwright)** — one honest path: register → create project → draw a wall → reload →
  the wall is still there.

We are explicitly not writing a test per getter.

---

## 7. What we are deliberately not building yet

3D, BIM, DWG/DXF, generative AI, CRDT multiplayer, comments, payments, organisations, a
large block library, a mobile editor. See [roadmap.md](roadmap.md). The architecture leaves
room for them — commands for collaboration, JSONB for entity extraction, share-link roles
for permissions — without paying for them now.

---

## 8. Related documents

- [document-format.md](document-format.md) — the on-disk / on-wire document schema
- [editor.md](editor.md) — how the drawing surface is built
- [geometry.md](geometry.md) — the maths layer and its conventions
- [data-model.md](data-model.md) — database tables and the REST API
- [roadmap.md](roadmap.md) — phases, and what lands when
