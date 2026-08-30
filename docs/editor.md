# The editor

How the drawing surface is put together. The reasoning behind the big choices is in
[architecture.md](architecture.md); this is the map of the code.

```
resources/js/editor/
├── geometry/    pure maths — vectors, segments, polygons, bounds, angles
├── model/       the document: types, parsing, element geometry, picking, factories
├── viewport/    world ↔ screen
├── commands/    Command, HistoryStack
├── store/       document, editor, viewport, and transient interaction state
├── render/      canvas renderer, grid, painters, overlay
├── snapping/    the snap engine and what it collects candidates from
├── scene/       the document as primitives — the one description every output consumes
├── export/      SVG, PNG and PDF, plus sheet layout
├── assets/      the block library
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
world millimetres, so picking feels identical at every zoom. Rooms also accept a hit anywhere
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

## 7. Input

`input/controller.ts` is the only place that touches DOM events. Above every tool it handles:

|                                |                                          |
| ------------------------------ | ---------------------------------------- |
| Wheel                          | zoom, anchored under the pointer         |
| Middle drag, or Space + drag   | pan                                      |
| `V` `W` `D` `N` `O`            | select, wall, door, window, room         |
| `L` `R` `C` `P`                | line, rectangle, circle, polygon         |
| `Delete` / `Backspace`         | delete the selection                     |
| `Escape`                       | cancel the current action and deselect   |
| Arrow keys                     | nudge by one grid step, or 1 mm with Alt |
| `Ctrl/Cmd + Z` / `+ Shift + Z` | undo / redo                              |
| `Ctrl/Cmd + A`                 | select everything selectable             |
| `Ctrl/Cmd + D`                 | duplicate                                |
| `Shift + 1` / `Shift + 2`      | zoom to fit / to selection               |

Keys typed into a form field belong to the field, not to the editor.

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

The distinction the scene carries that matters most is **line weight**. A `pen` width is a
plotted weight — 0.25 mm on the finished sheet — so it stays a constant thickness on screen
however far you zoom, and prints at 0.25 mm whatever the drawing's scale. A `world` width is a
real dimension: a 150 mm wall is 150 mm, and it shrinks as you zoom out because the wall does.
Each output converts pens its own way; nothing else has to think about it.

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

## 16. What is not here yet

Dimensions and measurement annotations, DXF, and anything collaborative. See
[roadmap.md](roadmap.md).
