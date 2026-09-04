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
once, and five outputs consume it — so the screen and a PDF cannot disagree about what a wall
with a door in it looks like:

```
document ──▶ scene ──┬──▶ canvas           the screen
                     ├──▶ canvas @ N×      PNG
                     ├──▶ SVG string       vector, layers intact
                     ├──▶ pdf-lib pages    real pages at a real scale
                     └──▶ DXF entities     full size, for other software to edit
```

A PDF is the one output made of pages, so it is the one that knows about sheets: it prints a
list of them, and can put each layer on a page of its own. Every page is laid out from the
same extent, which is what makes a set of layer prints lay over one another — the reason
anybody asks for one. The others have no page to divide, so they stay the whole drawing.

DXF is the one output that is not a picture, and it changes what "faithful" means. It is
still written from the scene, so a wall leaves as the shape a wall is drawn as rather than as
a wall — DXF has no idea what one is. What travels is geometry on layers at full size; pen
weights, fills and the page do not, because R12 has nowhere to put them.

Reading one runs the whole thing backwards, and is the only pipeline in the editor that does:

```
file ──▶ shapes ──▶ elements ──▶ command ──▶ document
        (the file's        (millimetres,
         units and y)       y the other way)
```

`interchange/dxfImport.ts` reduces a DXF's dozens of entity types to three shapes — a
polyline, a circle and a run of text — by flattening curves and exploding block references
where they stand. Everything a person has to decide sits between the two halves: what the
units are, which layers to bring, and whether the file is small enough to be a drawing at all.
Nothing imported becomes a wall, a door or a room, because nothing in a DXF says which lines
are one; what arrives is shapes, honestly labelled as such.

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
  describe(): CommandEnvelope;
}
```

Both halves are pure functions returning a _new_ document rather than mutating one, so a
command can be replayed and inspected without carrying hidden state.

`HistoryStack` executes, pushes, and can pop. Nothing else writes to the document — not a
React handler, not a tool, not the properties panel. Undo/redo is therefore correct by
construction rather than by remembering to snapshot.

**A command is also a closure, and that is the one thing it cannot be when it has to leave
this process.** Live co-editing sends an edit down a socket; a plugin in a sandbox sends one
through a message port. Both want the same thing, so `describe()` is on the interface: the
edit as plain JSON, with `parseCommand` in `commands/envelope.ts` as the way back.

Two decisions there are worth not re-arguing:

- **State, never intent.** An envelope says "these elements become those", not "move this by
  200 mm". That is what a command already _is_ — `execute` and `undo` are pure functions of
  captured state — so describing intent instead would be a redesign of this layer wearing a
  serialisation costume. It also means two editors that disagree resolve per element to
  whichever state arrived last, which is a rule you can say out loud.
- **One way in, and it validates.** `parseCommand` is the only thing that produces a `Command`
  from an envelope, and it is a parser rather than a cast — an envelope is by definition from
  somewhere else. It holds an element in a command to exactly what an element in a drawing is
  held to, because it uses the document's own schemas. A delete sends only its ids: where the
  elements were is a fact about the document it ran against, so the far side captures its own
  and can put them back in the order _it_ has them in.

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
│   ├── Sharing/     ShareLink, IssueShareLink, RevokeShareLink
│   ├── Blocks/      Block, BlockSchema, ReferencedBlocks
│   └── Underlays/   Underlay — a rasterised page to trace over
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
the printed scale bar, not on-screen zoom. A **sheet** carries a scale of its own, along with
a page size and the point it looks at — see `settings.sheets` in the document format. Laying a
drawing onto a sheet happens in exactly one place, `export/sheet.ts`, which is what the PDF
prints and what the canvas outlines: a page worked out twice is a page that agrees with the
print until one of the two is changed.

---

## 4. Rendering

One `<canvas>`, one rAF loop, painted in a fixed order:

```
1. paper / sheet background
2. grid              (adaptive: subdivisions fade out as you zoom away)
3. document elements, in layer order, hidden layers skipped
4. the active sheet's outline, when it is switched on
5. selection outlines and transform handles
6. active-tool preview (in-progress wall, rubber band)
7. snap indicator
8. dimension and measurement overlay
```

The loop paints only when something is marked dirty, so an idle editor costs nothing.
Layers 1–3 come from the document; 5–8 come from interaction state, which is why they can
update at pointer rate without touching React. The sheet outline sits between the two: the
page is in the document, but it is paper rather than drawing — never in the scene, never
exported as ink, and drawn over the plan because it is a statement about the plan.

There is a second canvas, and it is deliberately not this one. A saved version is looked at on
`render/review.ts`, a small surface that is _given_ a document rather than reading one: its own
viewport, its own scene, no store at all — so inspecting an old version cannot disturb the
drawing that is open. It paints through the same scene builder, with the comparison between two
versions marked over the top as a redline. Working out that comparison is `model/diff.ts`, which
is pure and knows nothing about canvases; see [editor.md](editor.md).

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
  the wall is still there. It lives in `e2e/`, runs against a real Laravel process and a real
  PostgreSQL, and is served the built assets rather than a dev server, because what it proves
  has to be what a person would be given.

We are explicitly not writing a test per getter.

There is deliberately **one** end-to-end test. A suite of them is slow, flaky, and duplicates
coverage that is cheaper a layer down; a single one that never fails for a silly reason is the
one people keep green. It also never looks at pixels — what the canvas is holding is read
through the things around it that name it, because a screenshot comparison fails for every
reason except the one that matters.

---

## 7. What we are deliberately not building yet

3D, BIM, DWG, generative AI, CRDT multiplayer, payments, organisations and teams, a large
block library, a mobile editor. See [roadmap.md](roadmap.md). The architecture leaves
room for them — commands for collaboration, JSONB for entity extraction — without paying for
them now.

Three things have come off that list, and the list did not notice the first two, which is the
failure mode a list like this has. **DXF** left in Phase 8, in both directions. **Version
history browsing and comparison** left in Phase 9.5. **Share-link roles and the membership
they grant** left in Phase 9.4: a project can now have a second person in it, with an account,
a role and a way out. **Comments and mentions** left in Phase 9.3 — their own tables,
anchored to a point in drawing millimetres, deliberately not in `documents.data`, with a
surface of their own for somebody who may comment but not edit. **Presence** left in Phase 9.1: a socket, a channel
per project, who is here and where their pointer is. What is still absent is a shared _edit_ —
there is no operation log, so a drawing is still saved whole against a revision and the second
person to save gets a conflict. Nothing tells you a mention happened yet either; that rides on
the same socket and has not been built. Anything struck off here
belongs in the same commit as the feature that strikes it.

---

## 8. Related documents

- [document-format.md](document-format.md) — the on-disk / on-wire document schema
- [editor.md](editor.md) — how the drawing surface is built
- [geometry.md](geometry.md) — the maths layer and its conventions
- [data-model.md](data-model.md) — database tables and the REST API
- [roadmap.md](roadmap.md) — phases, and what lands when
