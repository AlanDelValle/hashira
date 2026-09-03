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

**Met.** Walked end to end in a browser against Herd and PostgreSQL: register and sign in, the
seeded plan opening with its walls, openings, dimension, label and blocks, a wall drawn with
`W` and two clicks, a label written with `T`, a measurement taken with `M`, `Ctrl+Z` returning
the drawing to where it was, autosave settling, the drawing reopening intact, PDF, SVG and PNG
coming out of it, and a share link serving the same drawing read-only to a signed-out browser.

It was not met when Phase 6 was signed off, and the two gaps were the same mistake — reading
"dimension it" as typing exact values into the properties panel, which is not what it says.
Both were reported from the editor by someone looking for a tool that was not there:

- **No text tool.** `TextElement` was in the format, rendered in all four outputs, was picked,
  snapped and editable in the properties panel — and nothing could create one. `T` now places
  a label and it is typed on the sheet.
- **No dimension element at all.** Not in the format, not in the renderer, nothing, while
  every new document was created with a `Dimensions` layer that was impossible to fill and the
  landing page advertised a measurement the editor could not produce. `M` now measures between
  two snapped points, and the value is read off the geometry rather than stored.

---

## After the MVP

### Phase 7 — Drafting depth `[x]`

- [x] Advanced dimensioning: chains, angular, radial, leaders (linear dimensions landed in the
      MVP). Schema 3: a dimension became a run of points rather than a pair of them, and
      `angle`, `radius` and `leader` joined it — each storing what it measures and never the
      number it came to
- [x] Rooms with automatic boundary detection from walls: the walls are cut into a planar
      graph, the face under the pointer is walked out of it, and each edge moves in by half
      the thickness of its own wall
- [x] Wall joins and cleanups at corners and T-junctions
- [x] A real asset system: categories, search, and blocks somebody made — from a selection or
      from an SVG file, stored against the account and served alongside the drawings that use
      them
- [x] PDF import as an underlay to trace over: the page is rasterised in the browser,
      uploaded, and placed at its own size on a layer of its own — and is never exported and
      never handed out with a share link, because it is somebody else's drawing

Walked in a browser against Herd and PostgreSQL, one feature at a time: a chain measured in
three steps and carried on with a fourth click, an angle taken at a corner of the seeded room,
a note pointed at the bed, a room found by hovering inside four walls, a block made from the
bed and the wardrobe and then placed again, and a two-page PDF imported, its second page
placed at A4 and traced over — reopened afterwards to check each one came back.

Two things this phase settled that are worth keeping in mind. **A wall is an area, not a fat
line**: mitring its ends means its band is a quadrilateral, which is what removed the last
`world` stroke width from the scene and left every stroke a plotted pen weight. And **not
everything on the sheet belongs in the drawing**: an underlay is on the canvas and in the
document, and deliberately in neither the scene nor a share link, because what it holds is
somebody else's work.

### Phase 8 — Interchange `[x]`

The first phase about a drawing leaving and entering, rather than about drawing. It touches
contracts more than geometry: the schema, the API, and what a file promises somebody else's
software.

- [x] **8.1 Sheets and layouts.** Schema 5: `settings.sheet` — one page size framing whatever
      there was — became `settings.sheets`, pages each with a size, a scale and a place to
      look. A sheet with a `centre` is a window at the scale it was given, clipped to its
      frame; one without frames the whole drawing and steps its scale back until it fits,
      which is what every drawing did before. The canvas draws the page from the same layout
      function the PDF prints it from, and a PDF is the sheet being worked on.
- [x] **8.2 Richer export.** The PDF exporter prints a list of pages rather than a page:
      several sheets in one file, and optionally a page per layer so the prints lay over one
      another. Every page is laid out from the same extent, which is what makes them register.
      The export menu became a dialog, because which sheets and whether to split by layer are
      choices, and it says how many pages will come out before it runs. The margin a framed
      sheet leaves around the drawing moved into `layoutSheet`, so the outline on screen is
      now exactly the page that prints — it was padding in the exporter alone.
- [x] **8.3 DXF export.** A fifth reader of the scene, and the first that is not a picture:
      R12 ASCII, full size, on layers, with the drawing's palette mapped to colour indices by
      hue. Mirrored in y, because the drawing grows downward and a DXF grows upward. What R12
      does not have is what it costs — no lineweights, no `LWPOLYLINE`, no `HATCH`, so a
      wall's poché leaves as the outline a drafter would hatch on arrival
- [x] **8.4 DXF import.** The first thing here that runs the pipeline backwards: a file in,
      elements out. Reads R12 and after — lines, polylines with their bulges, circles, arcs,
      ellipses, text, paragraphs and solids — explodes block references and dimension blocks
      where they stand, mirrors y, and takes the units from `$INSUNITS` or from whoever is
      asked. **Nothing imported becomes a wall**, because nothing in a DXF says which lines
      are one. Bounded at ten thousand shapes, since a drawing is one JSON document saved
      whole and a survey is not a plan to draw over
- [x] **8.5 Print-oriented annotation tooling.** Schema 6, the drawing as something issued
      rather than only drawn: `settings.titleBlock` holds what a print says beyond the title —
      project, client, who drew it, which revision, the date it went out — and the `cloud`
      element is the mark that says which part changed. A cloud is a closed run drawn as a
      chain of outward half circles, never as the run itself: it is a note about the drawing,
      and an outline around part of a plan would read as something built. A north point and a
      break line joined the block library, on a new annotation shelf
- [x] **8.6 The sheet as a document.** What a print looked like was still a drawing on white
      paper with a line of grey text along the bottom. Now a border encloses the sheet, the
      title block is a ruled stamp of labelled fields with the mark in the corner of it, and
      schema 7 adds `settings.notes` — printed down a strip beside the drawing with a legend
      of the layers under them. The strip is paid for in drawing area rather than taken out of
      the margins, so `layoutSheet` decides it and the canvas outline narrows with the print.
      The mark itself moved to `lib/mark.ts`, because the interface and the exporter now both
      draw it and two copies of a logo is two logos

Walked in a browser against Herd and PostgreSQL, one at a time: a drawing saved before sheets
opening onto the page it was already printed at, a second sheet placed over part of the plan
and printed on its own, ten pages of one drawing laid out to register when stacked, a DXF
written and then read straight back in — fifty shapes landing on the layers they left from —
and a revision cloud drawn with `I` around the bed, printed under a title block that says who
drew it and when.

Decisions taken at the start of the phase, so they are not re-argued halfway through:

- **DXF is written from the scene, not from the document, and targets R12 ASCII.** The scene
  is already the one description four outputs agree on, so a fifth costs no new geometry, and
  R12 is the dialect that opens everywhere. It means a wall exports as the shape it is drawn
  as rather than as a wall: DXF has no semantics for one, and inventing them in a `DIMENSION`
  entity nobody can read back is worse than exporting what is on the sheet.
- **Curves flatten to polylines on import.** The document has `circle`, but no arc or spline.
  A new element type costs a schema version and a branch in four renderers, for shapes that
  are a few millimetres on the finished sheet — where the flattening is already finer than the
  plotter. The same trade the SVG block importer made.
- **DWG stays out.** It is Phase 10, and nothing in this phase is a step towards it.

### Phase 9 — Collaboration `[~]`

The first phase about more than one person. Everything before it assumes one: a drawing saved
whole against a revision, one history stack, and authorization from the authenticated user.

One piece of the groundwork is already in place, ahead of the phase that needs it: **a command
can be serialised**. `describe()` writes an edit as plain JSON and `commands/envelope.ts` reads
one back, validated against the document's own schemas. It was built during the refinement pass
rather than inside a feature, because live co-editing here and the plugin sandbox in Phase 10
need the identical thing, and building it twice is how the two end up disagreeing.

- [ ] Realtime presence and cursors (Laravel Reverb)
- [ ] Live co-editing built on the existing command stream
- [ ] Comments and mentions anchored to drawing coordinates
- [x] **Version history browsing and comparison** (restore landed in Phase 4). A version is
      looked at without being restored, on a surface that is handed a document rather than
      reading one, and any two of them are compared: elements matched by id, and what differs
      marked on the drawing and listed beside it. The current drawing is a version like any
      other in that list, which makes the default comparison "what have I done since I last
      saved a version"
- [ ] Share-link roles: viewer, commenter, editor

Started with the one part of this phase that needs none of the others. Comparing two versions
is a question about two documents; there is no websocket in it and no second person, so it
could be built while the decisions the rest of the phase turns on were still open.

What it settled, which the rest of the phase should not re-argue:

- **A comparison is computed, not recorded.** A version is a whole document — the drawing is
  one JSONB column and a snapshot copies it — so what changed between two of them is worked
  out by comparing them rather than by keeping a log. When co-editing brings an operation log,
  that log is for _ordering_ live edits and is not what this reads: two snapshots a month
  apart have no operations between them left to replay.
- **A version is looked at on a surface of its own.** `render/review.ts` is given a document
  instead of reading one, so inspecting an old version cannot disturb the drawing that is
  open. It is also the shape the rest of the phase needs — a surface that paints somebody
  else's state.
- **A redline never means something in colour alone.** Dashed is a state that is gone, solid
  is a state that is there now, every mark is in the list beside it in words, and the three
  colours the marks use are held to contrast like every other pair the interface paints. The
  same rule will decide what a remote cursor and a comment pin look like.
- **Both sides are migrated before they are compared.** A schema 5 snapshot is read as schema
  6, so a migration is never reported as somebody's work.

### Phase 10 — Platform

- DWG support
- Plugin system exposing the command and geometry APIs
- Organisations, teams and granular permissions
- Self-hosting improvements: containers, backups, upgrade path

### Phase 11 — Drafting depth `[x]`

The phase about a drawing saying what it already knows. A wall has two faces and reports one
length; a room is a shape with an area and no name; a layer holds forty elements and lists
none of them. Very little here is new geometry — it is the editor reading out what its own
model has already worked out, which is most of the distance between a drawing tool and a
drafting one. It is about drawing rather than about the platform, so it does not depend on
Phase 10 and the two can be taken in either order.

- [x] **11.1 Openings beyond the door and the window.** Schema 8: `door.geometry` gains how
      its leaf reads — single, double, sliding, folding, overhead, gate, or none at all —
      and how its head reads, square or arched. A gate, a garage door and an arch are a leaf, a
      leaf and a head rather than three element types, because a type costs a branch in five
      readers plus picking, snapping, bounds, the properties panel and the version comparison,
      and all three are a hole in a wall. An arch is drawn in plan as the clear opening with
      its springing dashed: a plan is a section at about 1.5 m and the arch is above it, so
      the rise is stored to keep the information rather than to put a curve where a drafter
      reads a wall. Widths become host-aware while this is open — `hostedFrame` clamps an
      opening's offset to its wall and does not clamp its width, so a 3 m garage door in a
      2 m wall hangs out of both ends
- [x] **11.2 Which face of a wall.** No schema, because `wallJoins` already has the answer:
      every band is mitred to parameters along its centreline — `startLeft`, `endLeft`,
      `startRight`, `endRight` — so each face's length is a subtraction that is currently
      thrown away after painting. Which face is _inside_ is decided by what encloses it and
      not by the order `a → b` was drawn, since `rooms.ts` already walks the face a point
      stands in. Where nothing encloses a wall, neither face is called internal: they are
      named by orientation instead, because a wall that bounds nothing has no inside, and
      claiming one is the same mistake as a dimension storing its value. The four band corners
      and the two face midpoints join the snap candidates, so a dimension can at last be taken
      to a face — through a source the snap collector reads rather than through
      `elementWorldPoints`, which also feeds bounds, box select and DXF
- [x] **11.3 A room drawn from its area.** No schema. A target area is typed the way a wall's
      thickness is typed, and the rubber rectangle holds that area while the drag changes its
      proportion: 12 m² is 3.00 × 4.00 or 2.40 × 5.00, read off the status bar from the same
      preview the tool commits. The target is the internal face, so the centrelines fall half
      a thickness outside it — which is why 11.2 comes first. Nothing records that an area was
      asked for: four walls are what gets created, and the area shown afterwards is measured
      off them, so rounding to the grid step reports what was drawn instead of what was wanted
- [x] **11.4 What a shape is made of.** Schema 9: `style.hatch` names one of the conventions
      of NBR 6492 — the three a renovation turns on (existing masonry, masonry to demolish,
      masonry to build) and the twelve that say what a thing is made of. It belongs to the
      **style of any closed shape** rather than to a room, because what these mostly mark is
      masonry: a wall, a room, a rectangle, a polygon or a circle can carry one, and the room
      tool and the text tool are untouched. Only the name is stored — a concrete hatch somebody
      has re-angled is no longer the mark anybody reads — and every spacing is in millimetres
      on the sheet, like a pen weight, because none of these represents a real size. Clipped by
      a scanline in `geometry/hatch.ts` and emitted as polylines and specks, so no output needs
      a line of code for it; a stipple is pseudo-random from a seed the element gives it, so it
      cannot shimmer as the drawing pans or come out differently in the PDF. Capped in segments
      per shape, coarsened rather than flooded past that, and dropped on screen below about two
      pixels of spacing. Walls are grouped by their layer _and_ their hatch, so a run coming
      down is never merged into the run staying up
- [x] **11.5 The layers panel as a scene tree.** No schema: `metadata.label` has been in the
      format since version 1 and nothing has ever read it. A layer expands into what is on it,
      each element names itself — a text by its content, a room by its name and area, a wall
      by its length, a block by the block — and a name somebody types goes to that field
      through a command, so renaming undoes like everything else. Hovering a row writes to
      `interaction` and asks for a repaint rather than rendering React, which is rule 5 and
      also the only way several hundred rows stay usable. The panel finally does what §3 of
      the document format says it does, too: create, rename, recolour, reorder and delete a
      layer, offering to move its contents before it empties one
- [x] **11.6 A library somebody can furnish a house from.** No schema — a block is an id and a
      size, and §4.6 already says what an unknown one draws. Thirty-nine blocks in eight
      categories became a hundred and nine in thirteen: Office, Garage, Garden, Laundry and
      Pool, the circulation pieces that turn up the moment a whole house is drawn, and the rest
      of the kitchen and the bathroom — at the sizes those things are really built at rather
      than at plausible ones. A test now holds the shelf to its own rules, because a hundred
      blocks cannot be read through and the mistakes that matter are dull: an id used twice, a
      category that does not exist, a coordinate typed in millimetres instead of box space.
      `LibraryPanel` got its own comment corrected on the way past — it advertised sixty-odd
      blocks in seven categories and had never once been right. **The services symbols are not
      here.** Electrical and plumbing marks are a standardised set, and half-remembered ones
      are worse than none: they want a pass against the standard itself and a legend to print
      beside them, which is its own piece of work rather than a corner of this one

The order is the dependency order rather than the order the six were asked in. 11.2 comes
before 11.3 because "twelve square metres" is a question about an internal face, and 11.4
before 11.5 because a room with a name is what a layer has to list. 11.6 depends on nothing
and can be built beside any of them.

11.1, 11.2 and 11.3 are done. Walked in a browser against Herd and PostgreSQL: the seeded plan
opening migrated from schema 7 with its door intact, all seven kinds of opening placed along
one wall and then read back through the editor's own SVG exporter — which is where a folding
door drawing an L rather than a fold gave itself away — the seeded bedroom's north wall
reporting a 3.85 m inside face against a 4.15 m outside one, then dimensioned face to face at
3.85 m, which the centreline could not have been asked for, and twelve square metres typed
into a panel, dragged into 3.50 × 3.50 and committed as four walls that the room tool then
measured at 12.25 m² — the number that was drawn rather than the one that was asked for.

11.6 is done too, and was looked at rather than tested: every block put on a contact sheet
through the editor's own SVG exporter and read. That caught eight drawings a passing suite
would not have — a filing cabinet with eight drawers, a hedge that read as three pots in a
box, and an extractor hood drawn with the same square and cross as the lift four blocks
below it.

11.4 went the same way. Every pattern was drawn as a swatch and held against the NBR sheets
it comes from, which caught three: concrete in elevation dense enough to read as timber, and
stone in section drawn dead parallel and therefore the same mark as made ground. Then walked
in the editor, on the seeded bedroom — one wall marked to demolish and drawn open beside the
three staying solid, one marked to build and hatched at 45°, and the door still cutting the
hatched one at its jamb.

Two things it deliberately does not do. The **zigzag of insulation and the comb of a slope in
elevation** follow an edge rather than fill an area, which is a different mechanism, so they
wait. And a **legend of the patterns a drawing uses** is not printed beside it yet: the strip
already lists the layers, and materials belong there too, but that is a change to what a sheet
says rather than to what a shape is.

11.5 finishes the phase, and it is the one that answers the request the whole of Phase 11
started from: a label reading "Bedroom" on the canvas now appears under Annotations in the
panel, which is where somebody goes looking for it. Walked in the editor on the seeded plan —
the four walls listed by their lengths, the blocks by the blocks, "Bedroom" under Annotations;
hovering a row highlighting it on the drawing and clicking it selecting it; a layer renamed,
recoloured and added; and Furniture offering to move its three elements to Architecture before
going, both halves undoing in one press.

Two things per-element that are **not** here, and the reason is the same for both. Hiding and
locking stay on the layer — see the decisions above — and there is no drag between layers in
the tree, because the properties panel already moves an element to another layer and a second
way to do one thing is a second way to keep working.

Decisions taken before the phase starts, so they are not re-argued halfway through:

- **Two schema numbers, not six.** Only the openings and the room change the shape of a
  document; the other four sub-phases derive, draw or arrange, and write nothing new. That
  matters because of rule 7: a reader that predates a version refuses the file outright, and
  each number costs a migration and a literal-JSON fixture on both sides — `model/document.ts`
  and `DocumentSchema.php`. Six numbers would have made this a phase about migrating.
- **A hatch is geometry, not a fill.** The obvious route is a `CanvasPattern` on screen, a
  `<pattern>` in the SVG, a tiling pattern in the PDF and nothing in the DXF: four
  implementations of one drawing, which guarantees four slightly different drawings and is
  the thing a single scene exists to prevent. R12 has no `HATCH` either. Clipped lines are
  what all five readers can draw identically, and what a hatch explodes to on arrival anyway.
- **A material scales in the world; a convention scales on the sheet.** A 400 mm tile is a
  real size and has to measure 400 mm however the plan is plotted — small at 1:100, and
  rightly so. A concrete hatch is notation and has to stay legible whatever the scale. Each
  pattern says which it is, which is the split the code already makes between a pen weight in
  sheet millimetres and a cap height in world ones.
- **The clipper takes one ring, because a room is one ring.** A scanline over a simple polygon
  is not a shortcut taken here: `room.geometry` is a single list of points, so a room with a
  column standing in it is not something the format can express in the first place. Holes
  would have to begin at the element and not at the clipper, which makes them a question for
  whichever phase turns out to need a room with a hole in it.
- **An element's name is derived until somebody types one.** Nothing stores "Wall 12".
  `model/naming.ts` answers what an element calls itself from what it is, and only an
  overriding name is written down. It is the rule that keeps a dimension from storing its
  value, applied to a list instead of to a sheet.
- **Hiding and locking stay on the layer.** A tree makes per-element visibility look natural,
  and it costs two fields on every element in the document — so a schema number — to
  duplicate a state the layer already has, and then to have to answer why something is
  invisible while its layer is visible. Isolating a layer and moving elements between layers
  cover what the request is usually really about.
- **Nothing here generates a plan.** The area tool is the one thing in this phase that could
  drift towards a generative feature, and the line is that it draws four walls and stops: no
  layout, no suggestion, no second room. The scope discipline in AGENTS.md is not relaxed by a
  tool that happens to take a number as input.

### Only after all of the above

**Project and drawing templates.** Started Phase 8 and taken back out of it, because the
question it asks is not a technical one: what a template _is_ — a set of layers and page
sizes, a drawing to start from, a whole project preloaded — decides the data model, and
deciding that from the implementation end is how a feature ends up being three features
nobody wanted. It waits until there is an answer.

3D extrusion, BIM-style semantics, and any generative feature. These are only worth building
on top of a drafting tool that is already good; built before it, they are a demo, not a
product.
