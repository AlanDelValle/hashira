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
├── tools/       select, line, rectangle, circle, polygon
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
| `V` `L` `R` `C` `P`            | select, line, rectangle, circle, polygon |
| `Delete` / `Backspace`         | delete the selection                     |
| `Escape`                       | cancel the current action and deselect   |
| Arrow keys                     | nudge by one grid step, or 1 mm with Alt |
| `Ctrl/Cmd + Z` / `+ Shift + Z` | undo / redo                              |
| `Ctrl/Cmd + A`                 | select everything selectable             |
| `Ctrl/Cmd + D`                 | duplicate                                |
| `Shift + 1` / `Shift + 2`      | zoom to fit / to selection               |

Keys typed into a form field belong to the field, not to the editor.

## 8. Grid

The document's grid size is what snapping uses. The grid that is _drawn_ is the first multiple
of it (×1, ×2, ×5, by decade) still at least nine pixels apart, so zooming out thins the lines
out instead of turning them into a grey wash. Major lines every fifth minor one, and the drawing
origin is marked so absolute coordinates have something to refer to.

## 9. What is not here yet

Snapping beyond the grid, the properties panel, wall and opening _tools_, layers you can edit,
autosave, and export. Those are Phases 3 to 5 in [roadmap.md](roadmap.md). Walls, doors, windows
and text already **render**, because the demo drawing contains them and an element the editor
cannot show is worse than one it cannot yet create.
