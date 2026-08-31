# The editor

How the drawing surface is put together. The reasoning behind the big choices is in
[architecture.md](architecture.md); this is the map of the code.

```
resources/js/editor/
├── geometry/    pure maths — vectors, segments, polygons, bounds, angles
├── model/       the document: types, parsing, element geometry, picking, factories,
│               wall joins, rooms
├── viewport/    world ↔ screen
├── commands/    Command, HistoryStack
├── store/       document, editor, viewport, and transient interaction state
├── render/      canvas renderer, grid, painters, overlay, underlays
├── snapping/    the snap engine and what it collects candidates from
├── scene/       the document as primitives — the one description every output consumes
├── export/      SVG, PNG and PDF, plus sheet layout
├── assets/      the block library, and making blocks from a selection or an SVG
├── tools/       select, wall, door, window, room, line, rectangle, circle, polygon, block
├── input/       DOM events → tools, plus pan, zoom and shortcuts
└── react/       the only React in the editor: canvas host, toolbar, panels, status bar
```

Only `react/` imports React. Everything above it runs in Node and is tested there.

---

## 1. The frame loop

One `<canvas>`, one `requestAnimationFrame` loop, and a dirty flag. The renderer subscribes to
the three stores and marks itself dirty; tools mark it dirty after touching interaction state.
When nothing is dirty the frame costs a function call.

Before anything is painted the canvas is transformed into world space:

```
device = (world − viewportOffset) × zoom × devicePixelRatio
```

so every painter works in millimetres and never thinks about zoom. The one thing that must
_not_ scale is pen weight — a hairline stays a hairline at every zoom, the way it would on a
plotter — so screen-sized values are divided by zoom on the way in (`px = 1 / zoom`).

Paint order is fixed: grid → elements in layer order → hover → selection → rubber band →
in-progress shape.

## 2. Why a drag causes no React render

State is split four ways (see [architecture.md §2.5](architecture.md)). The one that matters
here is **interaction state**: a plain mutable object in `store/interaction.ts` holding the
hovered id, the rubber band, the drag and its preview elements.

A drag writes to that object and asks for a repaint. The document does not change, so no store
notifies, so no component re-renders. On pointer-up a single command runs and the panels update
once. Cursor coordinates and the zoom percentage would break this rule, so they are written
straight into their DOM nodes by the render loop — see `render/readout.ts`.

## 3. Elements and their transform

`transform` maps an element's local geometry into the world: rotate about the local origin,
then translate. Factories place that origin at the element's own centre, which is what makes a
rotation handle pivot where a person expects and keeps a move a two-number change rather than a
rewrite of every vertex.

Doors and windows are the exception. They have no independent position — only a `hostId` and a
distance along that wall — so `model/elements.ts` takes a lookup everywhere, dragging one slides
it along its wall, and rotating one does nothing because it already follows the wall.

## 4. Picking

Hit-testing is on the **outline**, at a tolerance converted from a fixed screen distance into
world millimetres, so picking feels identical at every zoom.

Nothing walks the whole drawing to answer "what is under the pointer". `model/documentIndex.ts`
builds one index per version of the document — an id map, each element's bounds, and a uniform
grid two metres to a cell — and picking, snapping and the renderer's culling all query it. A
document is immutable, so an index belongs to exactly one version and cannot go stale; the one
for a superseded version is collected with it. On a several-hundred-element plan this is the
difference between a hover that costs a cell walk and one that costs the drawing. Rooms also accept a hit anywhere
inside, because a room is a space rather than a boundary; rectangles and circles do not, so that
a shape underneath stays reachable. A wall is picked anywhere across its thickness.

Once something is selected, anywhere inside its extent drags it — otherwise an outline-only pick
would make a selected rectangle impossible to grab by its middle.

The rubber band follows the convention drafting tools have used for decades, and its appearance
says which one is active:

| Drag direction | Mode     | Catches                        | Drawn  |
| -------------- | -------- | ------------------------------ | ------ |
| left → right   | window   | only what is completely inside | solid  |
| right → left   | crossing | anything it touches            | dashed |

## 5. Commands and history

Every mutation is a `Command` with `execute` and `undo`, both pure functions returning a new
document. `HistoryStack` runs them, and nothing else is allowed to write to the document store.

Commands sharing a `coalesceKey` and arriving within 600 ms merge into one history entry, so
holding an arrow key produces one undo step and not sixty. The merged command keeps the original
`before`, which is what makes that single undo return to where the edit started.

Three commands cover everything so far: `addElements`, `deleteElements` and `replaceElements` —
a move, a rotation and a property edit are all the last one.

## 6. Tools

A tool is a small state machine handed a `ToolContext` (the drawing, a lookup, the viewport, the
pick tolerance, the active layer, and a snap function). It writes previews into interaction state
and produces **exactly one command** when an action completes — never a partial edit.

The preview is built with the same factory that commits the result, so what is on screen while
drawing cannot differ from what lands in the document.

Line, rectangle and circle are press–drag–release. The polygon collects clicks; clicking its
first vertex closes the ring, Enter or a double click finishes it open, Escape throws it away.

The text tool is the one that does almost nothing itself. A click decides _where_ the label
goes and the words are typed into a real input the chrome floats over that point, because a
canvas has no caret, no selection and no input method — and a tool that cannot take an input
method cannot write half the names it will be asked to write. The field is sized and placed
from the same viewport transform the renderer uses, so what is being typed sits where the
finished label will sit, at the size it will be. Enter or a click elsewhere commits it, Escape
throws it away, and blank is not a label.

The room tool does not draw a room; it finds one. The walls around a space already say where
it is, and asking someone to trace a boundary that is sitting right there in the drawing is
asking them to copy it by hand and get it slightly wrong. Moving the pointer previews the
space it is standing in, a click accepts it, and the ring that lands runs along the inside
faces of the walls rather than their centrelines — so a corner between a 250 mm external wall
and a 100 mm partition is where those two faces actually meet. Where nothing encloses the
pointer there is nothing to accept, and clicks fall back to placing a ring by hand: a
courtyard, a zone, a room whose fourth wall has not been drawn yet. How the walls are turned
into spaces is in §18.

The dimension tool takes three clicks, because a dimension is three decisions: what to
measure from, what to measure to, and which side of it the value is written on. The first two
go through the ordinary snap engine — endpoints and intersections are exactly what anyone
wants to measure between — and the third is read off the pointer as a signed offset, so the
line can be pulled out to either side. What it measures is never one of the decisions: the
value is read off the two points every time it is drawn, and there is no way to type over it.

The measurement stays live after that third click, and a further click carries it on to
another point: one dimension line, a value for each step along it, and the parts adding up to
the whole because they are parts of one mark rather than a row of separate ones. Enter,
Escape or a double click ends the run.

Three more marks follow the same rule, that a measurement stores what it measures and never
the number it came to. **Angle** takes the corner and a point along each of its two legs, and
measures the lesser of the two angles that corner offers. **Radius** takes one click on a
circle: where the click landed decides which way the leader points, the value is the circle's
own radius, and a switch in the properties panel makes it a diameter instead. Away from a
circle it does nothing at all, because a radius with nothing to be the radius of is not
something the format can express. **Leader** is the one that writes rather than measures: a
click on what the note is about, further clicks to bend the line, then Enter — and the words
are typed into the same floating field a label uses, for the same reason.

The text field is focused one frame after it appears, which looks like a workaround and is not: the
click that opens it is a click on the canvas, and the browser moves focus to the canvas as the
_default action_ of that same mousedown — after the handler that opened the field has run.
Focusing immediately wins for a moment, then loses the keyboard and commits an empty label
before a character can be typed.

## 7. Input

`input/controller.ts` is the only place that touches DOM events. Above every tool it handles:

|                                |                                          |
| ------------------------------ | ---------------------------------------- |
| Wheel                          | zoom, anchored under the pointer         |
| Middle drag, or Space + drag   | pan                                      |
| `V` `W` `D` `N` `O`            | select, wall, door, window, room         |
| `L` `R` `C` `P`                | line, rectangle, circle, polygon         |
| `M`                            | dimension                                |
| `A` `U`                        | angle, radius                            |
| `T` `E`                        | text, leader                             |
| `B`                            | the block library                        |
| `G` / `S`                      | grid on or off / snap to grid on or off  |
| `Delete` / `Backspace`         | delete the selection                     |
| `Escape`                       | cancel the current action and deselect   |
| Arrow keys                     | nudge by one grid step, or 1 mm with Alt |
| `Ctrl/Cmd + Z` / `+ Shift + Z` | undo / redo                              |
| `Ctrl/Cmd + S`                 | save now                                 |
| `Ctrl/Cmd + A`                 | select everything selectable             |
| `Ctrl/Cmd + D`                 | duplicate                                |
| `Shift + 1` / `Shift + 2`      | zoom to fit / to selection               |
| `?`                            | the keyboard reference                   |

That table is written here for reading; the one the application uses is `input/shortcuts.ts`.
The controller dispatches from it, the toolbar labels its buttons from it and the `?` dialog is a rendering
of it, so a tooltip cannot promise a key that nothing listens for. It used to: the library
button advertised a `B` that had never been wired up.

Keys typed into a form field belong to the field, and keys pressed while a dialog or a menu is
open belong to that — otherwise naming a version "door" would swap the tool underneath it.

## 8. Snapping

One module decides where the pointer lands. Tools never look at the grid, at other elements or
at the zoom level: they ask for a point and receive one back together with the reason it moved,
so the overlay can say _why_ — an endpoint marker and an alignment guide are different pieces
of information.

Candidates are gathered from a small neighbourhood around the pointer, so a plan with thousands
of elements still compares a handful. Priority runs:

`endpoint → midpoint → intersection → alignment → grid`

An endpoint beats the grid however far away it is, because landing exactly on the corner of an
existing wall matters more than landing on a round number. The grid has no tolerance at all —
it always offers a candidate, so there is never a dead zone mid-cell where nothing snaps.

Alignment locks only the coordinate that matched, leaving the other where the pointer put it,
and draws a guide back to the point it lined up with. Tolerance is given in screen pixels and
converted through the zoom, so snapping feels identical at any magnification. A shape being
dragged is excluded from its own candidates — otherwise it would pin itself where it started.

## 9. Editing by value

The properties panel writes through `model/edits.ts`, a set of pure functions: type 3.42 into
the length field and `setSegmentLength` returns a wall 3.42 m long, keeping the `a` end put and
re-centring the local origin so rotation still pivots on the middle.

Every field commits through a command with a coalesce key of `field:elementId`, so an edit made
by typing undoes exactly like one made by dragging, and correcting a number twice in a row is
one history entry rather than two.

## 10. The block library

A block is drawn once in a normalised 0–1 box and scaled to the size the element carries. The
document stores an id and a size — never geometry — so plans stay small, one definition serves
every size, and the library panel's thumbnails are rendered from the same definitions the
canvas uses and cannot drift out of date.

Blocks come from two places and are the same thing either way. Thirty-seven ship with the
editor, written in `assets/library.ts`; the rest are made by whoever is drawing, stored on the
server against their account, and registered with the library as they arrive. `findAsset` looks
in both, so the painter, the exporters and the thumbnails resolve an id without knowing which
shelf it came off.

A block is made from a selection or from an SVG file. **From a selection** is a change of
coordinates and nothing more: the selection's own box becomes the 0–1 box. Only geometry comes
across — a measurement measures the drawing it was taken from, and scaled into a box and
stamped somewhere else it would be a number about nothing — and a block inside the selection is
flattened rather than referred to, because a block that pointed at another one would break the
day the other was deleted. **From an SVG** reads shapes and paths and throws away everything
about appearance: fills, strokes, text, images and the rest. A block is drawn with the drawing's
own pen weight on the layer it is placed on, which is why a plan full of blocks reads as one
drawing rather than as a scrapbook. Curves are flattened into polylines at a resolution finer
than the plotter, rather than growing a curve primitive four renderers would have to learn.

Sixty-odd blocks is more than a panel that wide can show, so the library searches by name and
filters by category, and the ones you made are the first shelf and the only ones you can throw
away. There is deliberately no way to edit a saved block: correcting one means drawing it
again, so a plan finished months ago cannot change under someone because a block was tidied up
on another project.

A drawing stores block ids, so a reader has to be able to resolve them — and a share link is
read by someone who has no library at all. The document endpoints therefore serve the
definitions a drawing refers to alongside it, filtered to the owner's own blocks. An id that
still does not resolve is not dropped: its footprint is drawn as a dashed rectangle, because a
block somebody placed still occupies that space.

## 11. Grid

The document's grid size is what snapping uses. The grid that is _drawn_ is the first multiple
of it (×1, ×2, ×5, by decade) still at least nine pixels apart, so zooming out thins the lines
out instead of turning them into a grey wash. Major lines every fifth minor one, and the drawing
origin is marked so absolute coordinates have something to refer to.

## 12. Saving

`persistence/autosave.ts` watches the document store and is shaped by four rules:

- **A save never blocks input.** Requests are fire-and-forget; the editor does not wait on one
  and does not freeze while one is outstanding.
- **Edits arrive in bursts.** A 1.2 s debounce absorbs a burst. A 10 s ceiling means someone
  drawing continuously still gets saved rather than only when they finally pause.
- **One request at a time.** Edits made during a save go out in one further request afterwards,
  not one request per edit.
- **A conflict is not an error to retry.** `documents.revision` guards every write; a 409 means
  the drawing was saved somewhere else, and retrying would overwrite that work. Autosave stops,
  says so, and offers a reload. Further editing does not resume writing over it.

A failed save retries with a growing delay, and further editing does _not_ reset that backoff —
rescheduling on every stroke would hammer a struggling server and would replace the message
saying the save failed with one saying everything is fine.

`Ctrl/Cmd + S` flushes immediately, and leaving the page with unsaved work asks for
confirmation.

## 13. Versions

Autosave keeps the latest work; a version is a point someone chose to come back to. Creating
one flushes first, so the snapshot is of what is on screen rather than whatever the server
happened to be holding.

Restoring runs through `replaceDocument`, a command like any other — so going back to a version
is itself undoable. A restore is a decision someone can regret, and the drawing they left
should be one Ctrl+Z away rather than gone.

## 14. One drawing, four outputs

`scene/build.ts` turns the document into primitives — polylines, circles, ellipses, arcs and
text, in world millimetres. It is the only place that knows what a wall with a door in it looks
like, and four consumers read it:

```
document ──▶ scene ──┬──▶ canvas          the screen
                     ├──▶ canvas @ N×     PNG
                     ├──▶ SVG             a file, layers intact
                     └──▶ pdf-lib         a page at a real scale
```

Writing that geometry four times would guarantee four slightly different answers. This way a
PDF cannot disagree with what was on screen.

The distinction the scene carries that matters most is between a **line** and an **area**. A
stroke is always a plotted pen weight — 0.25 mm on the finished sheet — so it stays a constant
thickness on screen however far you zoom, and prints at 0.25 mm whatever the drawing's scale.
Each output converts that its own way; nothing else has to think about it. Anything with a
real dimension is an area: a wall's poché is 150 mm across because the wall is, so it is
filled rather than stroked and gets smaller as you zoom out, the way the wall does.

It was a fat stroke until walls learned to meet each other. A stroke has two ends and they are
square, which is fine until two walls turn a corner and the outside of it is a notch neither
of them reaches into. Mitring says where each face of each band really stops, and that shape
is a quadrilateral, not a line — see §18.

Hidden layers are absent from the scene, so hiding a layer hides it in an export too. A wall's
openings come only from openings on visible layers, which is why hiding _Openings_ gives solid
walls rather than walls full of holes with nothing in them.

## 15. Export

SVG is written in world millimetres with `width` and `height` set to the drawing divided by its
scale, so a 1:50 file opens at a fiftieth of the building anywhere. Layers survive as groups.

PDF is a real page. The scale is never quietly adjusted to make a drawing fit: it steps to the
next standard ratio, the title block says which one was used, and a scale bar gives the reader
something to measure even if the page was resized on the way to them. pdf-lib is around 350 kB
and most sessions never export a PDF, so it is imported at the moment someone asks for one.

PNG is the same scene on an off-screen canvas at a chosen size. Pen weights follow the zoom, so
a larger export gets crisper lines rather than thicker ones.

One thing does not come free from sharing a scene: **alignment**. The canvas has `textAlign`
and SVG has `text-anchor`, and both apply it in the text's own frame, after any rotation. A PDF
has neither — `drawText` starts the baseline at the point it is given and rotates the run about
that point — so the exporter centres the text itself, and the shift has to travel along the
text's own baseline. Along the page's x axis it is the same direction only while the text is
horizontal, which is why vertical dimensions were the only thing in the drawing that came out
of the PDF sitting beside their line instead of on it.

## 16. Reach

The chrome is keyboard-operable throughout. The tool rail follows the ARIA toolbar pattern —
one tab stop, arrow keys within it — the canvas is focusable and shows a focus ring when it is
reached by keyboard rather than by pointer, and each page carries a skip link straight to its
content. Every colour pair the interface paints is held to WCAG 2.1 AA by `ui/contrast.test.ts`,
which reads the tokens out of the stylesheet rather than a copy of them: 4.5:1 for text, 3:1
for the edges of controls. That test is what pushed `ink-subtle` and the control border darker
than they were first drawn.

Below the `lg` breakpoint the editor is not merely hidden — it is not mounted, so a phone does
not start a render loop for a canvas nobody can draw on.

## 17. Tracing over a PDF

A survey arrives as a PDF far more often than as anything a drafting tool can open, and the
useful thing to do with it is to draw on top of it. Importing one lists its pages with their
real sizes, rasterises the page that was chosen and nothing else, and places it at that size
on a layer of its own — so it can be hidden or locked without touching the drawing above it.

The rasterising happens in the browser, with pdf.js, imported at the moment somebody asks for
it the way pdf-lib is on the way out. On the server it would mean Ghostscript or Imagick
installed on every machine that runs this, and it would mean uploading a whole survey before
knowing whether page four was the one wanted.

An underlay is the one thing on the sheet that is not part of the drawing, and everything else
about it follows from that:

- **It is not in the scene.** `render/underlay.ts` paints it straight onto the canvas beneath
  the grid; no exporter ever sees it. What it holds is usually somebody else's drawing, and a
  plan that quietly carries it into a PDF is a plan nobody can publish.
- **It is not part of what a share link hands out.** The link gives away the drawing; the
  pages it was traced from stay behind the project's own policy.
- **Nothing snaps to it.** It is a picture, not geometry: snapping to the edge of the paper
  would land new work on the page rather than on the building drawn on it.

The picture is fetched once and kept, because a drawing repaints at pointer rate and an image
that reloaded per frame would be a request per frame. One that has not arrived yet is a dashed
outline; one nothing is known about — which is what a share link sees — is nothing at all,
since an outline would advertise a document that is not being given.

## 18. Where walls meet

A wall is a band as wide as it is thick. Two of them turning a corner, drawn as two bands with
square ends, overlap on the inside of the corner and leave a square notch on the outside that
neither of them reaches into. `model/walls.ts` works out where each face of each band actually
stops, and the drawing shows a corner instead of two rectangles.

Ends within a millimetre of each other are one junction. Sorted by the direction they leave
in, each neighbouring pair bounds one wedge of that junction, and the two faces looking into
that wedge are what have to meet — the same rule for a corner, a T and a crossroads, which is
why nothing counts how many walls arrived. A very shallow corner mitres to a spike metres long,
so past eight half-thicknesses the band is cut off square instead, exactly as a stroke join is.

Two walls mitred that way share the sloped edge their bands end on, so their union is the
corner and nothing is left over. Three or more do not: each band ends on an edge of a small
polygon between them that is nobody's. That polygon is the junction itself, and it is filed
under every wall that meets there so that painting one of them alone — a hover, a selection —
still draws the junction whole.

The other kind of T is a wall that stops against the side of another rather than at its end.
Whether it was drawn to the other wall's face, to its centreline or a little short of both,
the stem is carried on to the centreline so the two lots of poché merge and the junction reads
as one piece rather than as a butt joint with a hairline in it.

None of this touches the document. A join is a fact about how walls are drawn, derived from
where they are, so moving one wall re-mitres its neighbours without editing them — and undo
has nothing extra to undo.

### Finding a room

The same walls answer a second question: what space is the pointer standing in. `model/rooms.ts`
cuts every centreline at every crossing into a planar graph, walks the face containing the
point out of it, and moves each edge of that face in by half the thickness of the wall it came
from. Consecutive edges meet at the crossing of those two inset lines, so a room bounded by a
250 mm wall and a 100 mm partition has its corner where those two faces meet rather than at
either centreline.

Dead ends are dropped first, over and over until none is left: a wall with a free end encloses
nothing, and leaving it in gives the walk a spur to go up and come back down — a zero-width
spike across the middle of a room. A stub sticking into a space is not part of that space's
boundary, which is exactly what removing it says.

The graph is worked out once per version of the document and cached against it, the way
`documentIndex` is, because the room under the pointer is asked for on every pointer move
while the room tool is armed and cutting every wall against every other one is not something
to do sixty times a second.

Every wall on a layer is filled as **one** shape rather than one per wall. Two fills that
share an edge each cover about half the pixels along it, and the pale hairline that leaves at
every mitre is the notch coming back wearing a different hat.

The joins are worked out once per version of the document and cached against it, the way the
index is. The drawing, the hover and the selection are three separate scenes every frame and
all three need the same answer; without that, panning across a large plan would re-mitre every
corner three times a frame. While something is being dragged the previewed positions are what
the mitres have to follow, so they are worked out again — but only then.

## 19. What is not here yet

DXF, and anything collaborative. See [roadmap.md](roadmap.md).
