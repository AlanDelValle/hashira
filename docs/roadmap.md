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

- [x] **9.0 Serialisable commands.** `describe()` writes an edit as plain JSON and
      `commands/envelope.ts` reads one back, validated against the document's own schemas. It
      was built during the refinement pass rather than inside a feature, because live
      co-editing here and the plugin sandbox in Phase 10 need the identical thing, and
      building it twice is how the two end up disagreeing. An envelope describes state and
      never intent, and `parseCommand` is the only way in — a second, trusting entry point
      would end up being used on wire data
- [ ] **9.1 Realtime presence and cursors** (Laravel Reverb)
- [ ] **9.2 Live co-editing** built on the existing command stream
- [ ] **9.3 Comments and mentions** anchored to drawing coordinates
- [x] **9.4 Share-link roles: viewer, commenter, editor**, and the membership a link grants.
      A link now carries what it hands out. `viewer` is the whole of anonymous access and
      records nobody; the other two cannot be taken up without signing in, and accepting one
      writes a `project_members` row. From that moment the token is finished: `view`,
      `update`, `comment`, `share`, `delete` and `manageMembers` are answered by the policy
      reading that row, so a second person is a fact in the database rather than a URL being
      passed around
- [x] **9.5 Version history browsing and comparison** (restore landed in Phase 4). A version is
      looked at without being restored, on a surface that is handed a document rather than
      reading one, and any two of them are compared: elements matched by id, and what differs
      marked on the drawing and listed beside it. The current drawing is a version like any
      other in that list, which makes the default comparison "what have I done since I last
      saved a version"

The numbers are the order these were written in, not the order they are taken. 9.5 went first
because comparing two versions is a question about two documents — no socket in it and no
second person — so it could be built while the decisions the rest turns on were still open.
The rest is taken **9.4 → 9.3 → 9.1 → 9.2**, by that same rule. 9.4 went next because it needs
neither a socket nor a live edit, and it produces the thing the other three are all about: a
second person with an account attached to a project. 9.3 needs that person and still needs no
socket. 9.1 is the first item that needs Reverb and asks the least of it — a name and a
position. 9.2 is last because it is the one that rewrites how a drawing is saved.

What 9.5 settled, which the rest of the phase should not re-argue:

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

What 9.4 settled, on top of those:

- **Two controls, because there are two acts.** Revoking a link closes the door: nobody else
  comes in and the anonymous viewers lose the drawing. Removing a member shows somebody
  already inside back out. Collapsing them into one would mean an owner cannot re-issue a link
  without evicting the people they are working with — and re-issuing is how the expiry is
  changed. A member can also leave, without asking, because nobody should be stuck in somebody
  else's project for having once opened a link.
- **Accepting a link never lowers a role.** An owner issuing a commenter link is inviting more
  people, not demoting the editor who is halfway through a drawing.
- **A denial says which of the two things it is.** No access at all is `404`, so a project id
  reveals nothing. Access, but not for this, is `403` — telling a member that the drawing on
  their screen does not exist is a lie they can see through.
- **A block belongs to a person, so a drawing resolves two libraries.** `ReferencedBlocks`
  looks the ids up against the owner and everybody with an editor's membership: anybody who
  could have placed one. Narrower and the owner opens their own plan to find a dashed
  footprint where a collaborator put a desk.
- **A duplicate belongs to whoever asked for it.** It used to be filed under the original's
  owner, which was the same person until this sub-phase and silently wrong afterwards. It is
  an editor's privilege now, not a viewer's: taking a copy of somebody's drawing into your own
  account is a bigger thing than looking at it.
- **The commenter role is not offered in the share dialog yet.** It exists in the column, the
  enum, the policy and the tests, and the picker gets it in 9.3 — when there is something to
  comment on. A picker that promised it today would be a picture of a feature rather than the
  feature, which is the mistake rule 10 exists to prevent.
- **Two editors are possible now and not yet pleasant.** The drawing is still saved whole
  against a revision, so the second person to save gets the conflict `autosave` already
  reports. That is honest and it is 9.2's job, not this one's.

Decided before the rest of the phase started, so they are not re-argued halfway through:

- **Comments get their own table, not `documents.data`.** Putting them in the drawing would
  drag them into undo, into every export, into the share payload and into the version diff —
  a comment is not a thing anybody drew — and it would mean the document schema has to move
  every time the conversation about a drawing changes shape.
- **Undo stays local, and it emits an inverse command.** With two people editing, popping a
  shared stack undoes whatever happened last, which may be somebody else's work. So undo
  keeps meaning "take back what _I_ just did": it appends the inverse of the local command at
  the end of the sequence rather than removing anything from it. The history stack the editor
  already has is per-session, which is the right shape for this and not an accident.
- **An anonymous link never edits.** `viewer` is the only role a link can hand to somebody
  with no account. `commenter` and `editor` require signing in, which is what keeps
  non-negotiable rule 6 intact: authorization is still a policy answering about an
  authenticated user, never about a token in the request.
- **A second person is a row, and the link is what writes it.** Accepting a `commenter` or
  `editor` link while signed in records a membership of that project; from then on the policy
  reads the row and the token is not consulted again. That is the cheapest honest way to get
  a second person without building Phase 10's organisations, and it leaves that phase free to
  grant membership by other means later — exactly the room `share_links.role` left for this.
  Membership outlives the link that granted it, so re-issuing a link does not evict the
  people already inside; withdrawing access is its own control, on the share dialog.

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

### Phase 12 — The line as notation `[x]`

The counterpart to 11.4, one step over. A hatch says what a shape is made of; a line says what
it _is_ — visible or hidden, a centre, an axis, a trajectory, something overhead. NBR 8403
fixes both halves of that: nine line types, of which eight are a line here and the ninth is
already a block, and a **line group** that sets three widths at once rather than one at a time,
because what carries the meaning is the ratio between them rather than any single number.

| Group | Extralarga | Larga | Estreita |
| ----- | ---------- | ----- | -------- |
| 0,25  | 0,50       | 0,25  | 0,13     |
| 0,35  | 0,70       | 0,35  | 0,18     |
| 0,50  | 1,00       | 0,50  | 0,25     |
| 0,70  | 1,40       | 0,70  | 0,35     |
| 1,00  | 2,00       | 1,00  | 0,50     |

**The scope is the four tools that draw a shape for its own sake: line, rectangle, polygon and
circle.** How a wall, an opening, a room, a dimension or a hatch is drawn does not change, and
neither do their weights. That is the whole difference between this phase and a restyling of
the drawing: the standard is offered to the person drafting, on the elements they draft with,
rather than applied over the top of elements the editor draws for reasons of its own. A wall is
an area mitred at its joins and stroked at one weight, which is what Phase 7 settled, and it
stays that.

Almost nothing moves on screen, because the default already _is_ the standard. All four are
drawn today at 0.25 mm solid — exactly _contínua larga_ of group 0,25, whose other two weights
the code is already holding as `PEN.normal` and `PEN.heavy`. An existing drawing gains a name
for what it was doing and seven alternatives beside it, and `hatchFill` keeps deciding the
inside of a closed one.

That scope also rescues the type that has nowhere to land when the editor is the one choosing.
_Traço e ponto extralarga_ marks the ends and the changes of direction of a section plane, and
the editor has no section plane — but somebody drawing that marking draws it with the line
tool, and this is the type it wants. The same goes for a trajectory, a centre line and the
projection of a balcony, an eave or a canopy: the editor cannot know that a run means one of
those, and the person drawing it does.

- [x] **12.1 The eight types, named.** Schema 10: `style.lineType` names one of them, and
      `model/lineTypes.ts` sits beside `model/hatches.ts` holding what each one draws — the
      dash pattern in millimetres on the sheet, and the weight, because _tracejada estreita_ is
      one thing in the standard rather than a type and a width chosen separately. Only the name
      is stored, and the scene resolves it for the four shapes and for nothing else. `Stroke`
      has carried a `dash` since the arched head arrived, so the screen, the PNG and the SVG
      needed no new code — but **the PDF exporter had never read it**, and had been printing
      every dashed line solid since Phase 11.1. Fixed first and on its own, because it is a bug
      in what the editor already drew rather than part of this
- [x] **12.2 Choosing one.** A picker in the properties panel next to the hatch picker, gated
      to `line`, `rect`, `polygon` and `circle` the way `HATCHABLE` gates the other one — a
      second list rather than the same one, since a wall and a room are hatched here and never
      re-lined, and a line has no inside to fill. Written through a command, so it undoes like
      everything else. And a second one in the side panel _before_ the shape is drawn, kept for
      the next one the way the wall tool keeps a thickness, because a centre line is rarely
      drawn alone. It goes onto the rubber band as well as the committed shape: choosing the
      convention is only useful if you can see it before letting go. Choosing contínua larga
      takes the field off rather than writing it, so a drawing never fills up with a field
      saying what its own absence already said
- [x] **12.3 A legend of both.** Parked in 11.4 and unblocked here. The strip beside the
      drawing lists the layers; what a drawing is actually read by is its patterns and its
      lines. One key rather than two lists, because the reader is asking the same question of
      both — and the row carries the mark itself, drawn from the same clipping functions the
      scene uses and at the size it is drawn on the sheet, since a list of names cannot be
      matched to anything. `model/conventions.ts` gathers it from the elements, because the
      scene has forgotten which convention its geometry came from. A hatch is named by what it
      is and a line type by what it is _for_: "Dashed, narrow" beside a dashed line explains
      nothing, so each type gained the application the standard lists first. One convention now
      earns a strip where one layer never did — a layer is a name the drafter chose, a hatch is
      a mark that means nothing to a reader who has not been told what it is

The eight are a dash pattern and arrive together. The ninth, **contínua com zigue-zague
estreita**, is not one of them and is not missing either: it already exists as the `break-line`
block on the annotation shelf, from Phase 8.5. It was never a dash pattern to begin with — the
run itself deviates, which is generated geometry like the revision cloud's bumps — and a
convention the library already draws does not need a second way to be drawn.

The dead fields went with it. `style.strokeWidth` and `style.dash` had been in the format since
version 1, validated by zod, and were written by nothing and read by nothing — `§4.7` of
[document-format.md](document-format.md) documented the first as though it worked. `lineType` is
what they were reaching for, and schema 10 removed them: no migration step, because an unknown
key is dropped at validation, which is what always happened to those two anyway.

Walked one sub-phase at a time. 12.1 was **looked at** rather than only tested: all eight drawn
as a contact sheet through the editor's own SVG exporter and read, which is how the family came
to share one rhythm rather than one dash length per weight. It also turned up a bug older than
the phase — the PDF exporter had never read `Stroke.dash`, so every arched head and every
overhead door had been printing solid since 11.1, on screen dashed and on paper not. Fixed
first and on its own.

12.2 was walked in a browser against Herd and PostgreSQL, driven by the project's own
Playwright so no password was typed by hand: the line tool picked, dash-dot chosen before
anything was drawn, the rubber band dashing as it was dragged, the shape committing with the
panel already naming its type, autosave settling, and a reload bringing back a 6.5 m line that
still says Dash-dot.

12.3 was printed and read, which is the only way to check a legend. A renovation plan using six
hatches and five line types came out with every key row matched against its own mark on the
drawing, and a crowded A4 came out with the key cut and the cut marked. Both of the things that
were wrong were found by looking rather than by the suite: the first layout starved the notes
on a sheet too short for everything, which is backwards — a note exists nowhere else and a key
can be read off the drawing again, so the notes are now measured first and the key gets what is
left. And the key's marks hung off the baseline while its rows stepped at a pitch of their own,
so a block meant to sit beside Notes and Layers read as a third thing. The rise a mark takes
above its baseline is now one number both list blocks measure from, and the key steps at the
legend's pitch with the swatch sized to fit it.

Decisions taken before the phase starts, so they are not re-argued halfway through:

- **Only the name is stored**, exactly as in 11.4. A dashed line somebody has re-spaced is no
  longer the line anybody reads, and a document holding `[2, 1.5]` has recorded a habit rather
  than a convention.
- **The weight rides with the type.** The standard names a line once — _tracejada estreita_,
  _traço e ponto extralarga_ — so the picker offers eight conventions and not a type crossed
  with three widths. It is also the answer to not needing every thickness: the drawing uses the
  weights its types call for and never asks for a number.
- **The group is 0,25 and is not a setting.** It is the row today's weights already sit on, so
  choosing it moves nothing. A group in `settings` would only mean something if it reached the
  weights a wall and a dimension are drawn at, which is the thing this phase is deliberately
  not doing.
- **An absent `lineType` is _contínua larga_.** Not a further state and not a migration: it is
  what all four already draw, so no existing drawing is restyled and no element has to be
  rewritten in order to keep looking like itself.
- **A line type is notation and scales on the sheet.** The split 11.4 made, applied again:
  every dash and every gap is in millimetres of paper, so a centre line reads the same at 1:50
  and at 1:100, and the weight it is drawn with was already measured that way.
- **The DXF carries neither the type nor the weight.** R12 does have linetypes — the exporter
  already names `CONTINUOUS` on every layer — so writing an `LTYPE` table looked like the one
  part of this that could travel. It is not, and the reason is the same one Phase 8 gave for
  leaving pen weights behind: **a DXF has no paper**. A dash is measured on the sheet, so
  turning 3 mm into drawing units needs a plot scale, and the plot scale is exactly the
  decision the person receiving the file makes. Baking 1:50 into an `LTYPE` makes the file
  wrong for anybody who plots it at 1:100, and wrong quietly. Carrying the pattern while
  dropping the weight would also give a drawing that is neither what was on screen nor plain
  geometry. So a dashed line exports as the run it is, on its layer, at full size, and whoever
  opens it assigns a linetype at the scale they are actually plotting — the same arrival job as
  hatching a wall's poché.

### Only after all of the above

**Project and drawing templates.** Started Phase 8 and taken back out of it, because the
question it asks is not a technical one: what a template _is_ — a set of layers and page
sizes, a drawing to start from, a whole project preloaded — decides the data model, and
deciding that from the implementation end is how a feature ends up being three features
nobody wanted. It waits until there is an answer.

3D extrusion, BIM-style semantics, and any generative feature. These are only worth building
on top of a drafting tool that is already good; built before it, they are a demo, not a
product.
