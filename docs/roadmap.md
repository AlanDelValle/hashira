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

### Phase 2 — Editor core `[ ]`

- [ ] Canvas host, device-pixel-ratio handling, resize
- [ ] Viewport: world/screen transform, zoom to cursor, pan, zoom to fit, zoom to selection
- [ ] Adaptive grid with configurable spacing
- [ ] Document store, command bus, history stack
- [ ] Selection: click, shift-add, box select, hover feedback
- [ ] Move, rotate, duplicate, delete
- [ ] Line, rectangle, circle, polygon
- [ ] Status bar: cursor coordinates, zoom, scale, grid and snap toggles

Exit criteria: drawing and manipulating basic shapes feels precise and immediate. We do not
move on until it does.

### Phase 3 — Architecture tools `[ ]`

- [ ] Wall with thickness, chained drawing, poché rendering
- [ ] Doors and windows hosted on walls, opening cut into the wall
- [ ] Room / space element with derived area
- [ ] Snap engine: grid, endpoint, midpoint, intersection, axis alignment, with indicators
- [ ] Properties panel driven by real values (length, thickness, angle, position, layer)
- [ ] Layers panel: visibility, lock, ordering
- [ ] Local element library, roughly 30–50 parametric furniture and fixture blocks

### Phase 4 — History and persistence `[ ]`

- [ ] Undo / redo across every command, with coalescing for property edits
- [ ] Autosave with debounce, save status, retry, and optimistic-concurrency conflict handling
- [ ] Reopen a project and get the exact drawing back
- [ ] Manual "create version" snapshots

### Phase 5 — Export and share `[ ]`

- [ ] SVG export (vector, layer-aware)
- [ ] PNG export at selectable resolution
- [ ] PDF export with real page size, scale, scale bar and title block
- [ ] Read-only share links at `/share/{token}`, revocable

### Phase 6 — Polish `[ ]`

- [ ] Keyboard shortcuts throughout, with a discoverable reference
- [ ] Empty, loading and error states everywhere
- [ ] Focus management, ARIA labelling, contrast audit
- [ ] Small-screen message for the editor; responsive landing and dashboard
- [ ] Performance pass against a several-hundred-element plan
- [ ] Demo account and seed drawing, screenshots in the README

---

## MVP definition of done

A person who has never seen the project can: create an account → create a project → draw a
plan with walls, doors, windows and furniture → set exact dimensions → use snapping →
organise layers → undo and redo → have it saved → reload and find it intact → export it →
share a link. No mockups, no placeholder features.

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
- Version history browsing, comparison and restore
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
