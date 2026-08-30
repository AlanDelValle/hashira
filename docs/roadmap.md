# Roadmap

The MVP is a small product that works end to end, not a large product that half works.
Everything below the MVP line is deliberately deferred and recorded here so it does not
leak into the current scope.

Legend: `[ ]` planned · `[~]` in progress · `[x]` done

---

## MVP

### Phase 0 — Discovery `[x]`

- [x] Inspect the existing repository and toolchain
- [x] Choose the product name
- [x] Decide the architecture and record it in [architecture.md](architecture.md)
- [x] Specify the document format in [document-format.md](document-format.md)
- [x] Decide the database model and the API surface
- [x] Open-source scaffolding: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT

### Phase 1 — Foundation `[x]`

- [x] Migrations for `projects`, `documents`, `document_versions`, `share_links`
- [x] Authentication: register, login, logout, password reset (session + CSRF)
- [x] REST API: projects, document load and save, versions, share links, public share
- [x] React + TypeScript + Vite + Tailwind SPA shell, routing, design tokens
- [x] Landing page
- [x] Projects dashboard: create, rename, duplicate, delete
- [x] Editor route that loads a real document
- [x] Pint, PHPStan, ESLint, Prettier, TypeScript strict, Vitest, Pest, GitHub Actions CI
- [x] Verified end to end against PostgreSQL 17: migrations, seed, the full suite, and the
      sign-in → dashboard → editor path in a browser

Exit criteria: you can register, sign in, create a project and land in an editor that has
loaded a real document from the database.

### Phase 2 — Editor core `[x]`

- [x] Canvas host, device-pixel-ratio handling, resize
- [x] Viewport: world/screen transform, zoom to cursor, pan, zoom to fit, zoom to selection
- [x] Adaptive grid with configurable spacing
- [x] Document store, command bus, history stack
- [x] Selection: click, shift-add, box select (window and crossing), hover feedback
- [x] Move, rotate, duplicate, delete, grid snapping, arrow-key nudge
- [x] Line, rectangle, circle, polygon
- [x] Status bar: cursor coordinates, zoom, scale, grid and snap toggles
- [x] Rendering for every element type the format defines, including hosted openings

Exit criteria: drawing and manipulating basic shapes feels precise and immediate. We do not
move on until it does.

### Phase 3 — Architecture tools `[x]`

- [x] Wall tool: chained drawing, thickness on creation (poché rendering landed in Phase 2)
- [x] Door and window tools, placed on the wall they cut
- [x] Room element with derived area
- [x] Snap engine: grid, endpoint, midpoint, intersection, axis alignment, with indicators
- [x] Properties panel driven by real values (length, thickness, angle, position, layer)
- [x] Layers panel: visibility, lock, ordering, and which layer is active
- [x] Local element library — 37 parametric blocks across seven categories

### Phase 4 — History and persistence `[x]`

- [x] Undo / redo across every command, with coalescing for property edits
- [x] Autosave with debounce, ceiling, save status, retry with backoff, and conflict handling
- [x] Reopen a project and get the exact drawing back
- [x] Manual "create version" snapshots, listed and restorable through an undoable command

### Phase 5 — Export and share `[x]`

- [x] SVG export — vector, layer-aware, sized so 1:50 opens at a fiftieth
- [x] PNG export at selectable resolution
- [x] PDF export with real page size, standard scale stepping, scale bar and title block
- [x] Read-only share links at `/share/{token}`, revocable, with a real pan-and-zoom viewer

### Phase 6 — Polish `[x]`

- [x] Keyboard shortcuts throughout, dispatched from one table, with a `?` reference built from
      the same table and advertised in the status bar
- [x] Empty, loading and error states everywhere, with a way out of each failure
- [x] Focus management, ARIA labelling, and a contrast audit that runs in the test suite
- [x] Small-screen message for the editor; responsive landing and dashboard
- [x] Performance pass against a several-hundred-element plan: one spatial index per document
      version, so a hover costs 0.01 ms instead of 0.48 ms on 720 elements
- [x] Split the editor out of the landing bundle — the main chunk is 282 kB, down from 559 kB
- [x] Demo account and seed drawing, screenshots in the README

Exit criteria, and the MVP's: a person who has never seen the project can create an account,
draw a plan, dimension it, snap, organise layers, undo, save, reopen, export and share.

---

## MVP definition of done

A person who has never seen the project can: create an account → create a project → draw a
plan with walls, doors, windows and furniture → set exact dimensions → use snapping →
organise layers → undo and redo → have it saved → reload and find it intact → export it →
share a link. No mockups, no placeholder features.

**Not met — one gap left.** Everything else was walked end to end in a browser against Herd and
PostgreSQL: register and sign in, the seeded plan opening with its walls, openings, label and
blocks, a wall drawn with `W` and two clicks, a label written with `T`, `Ctrl+Z` returning the
drawing to where it was, autosave settling, the drawing reopening intact, PDF, SVG and PNG
coming out of it, and a share link serving the same drawing read-only to a signed-out browser.

Two gaps were found after Phase 6 was signed off, both of them the same mistake — reading
"dimension it" as typing exact values into the properties panel, which is not what it says.

- **No text tool.** ~~`TextElement` was in the format, rendered in all four outputs, was picked,
  snapped and editable in the properties panel — and nothing could create one.~~ Fixed: `T`
  places a label and it is typed on the sheet.
- **No dimension element at all.** Still true. Not in the format, not in the renderer, nothing.
  Every new document is created with a `Dimensions` layer that is impossible to fill, and the
  landing page's illustration shows a dimension the editor cannot produce. Phase 7's "advanced
  dimensioning" assumes a basic one that was never built. The MVP is not done until a dimension
  can be drawn on the sheet.

---

## After the MVP

### Phase 7 — Drafting depth

- Advanced dimensioning: chains, angular, radial, leaders
- Rooms with automatic boundary detection from walls
- Wall joins and cleanups at corners and T-junctions
- A real asset system: categories, search, user-uploaded blocks
- PDF import as an underlay to trace over

### Phase 8 — Interchange

- DXF import and export
- Richer export: multi-sheet, layouts, per-layer PDF
- Project and drawing templates
- Print-oriented annotation tooling

### Phase 9 — Collaboration

- Realtime presence and cursors (Laravel Reverb)
- Live co-editing built on the existing command stream
- Comments and mentions anchored to drawing coordinates
- Version history browsing and comparison (restore landed in Phase 4)
- Share-link roles: viewer, commenter, editor

### Phase 10 — Platform

- DWG support
- Plugin system exposing the command and geometry APIs
- Organisations, teams and granular permissions
- Self-hosting improvements: containers, backups, upgrade path

### Only after all of the above

3D extrusion, BIM-style semantics, and any generative feature. These are only worth building
on top of a drafting tool that is already good; built before it, they are a demo, not a
product.
