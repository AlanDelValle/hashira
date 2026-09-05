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

### Sending one somewhere else

Each command can `describe()` itself as plain JSON, and `commands/envelope.ts` reads one back.
Nothing uses it yet — it exists because two things that do not exist yet need exactly the same
thing, and building it twice later is how they end up disagreeing: co-editing has to send an
edit down a socket, and a plugin in a sandbox has to send one through a message port.

`parseCommand` is the only way back in, and it validates rather than casts, using the document's
own schemas. An edit is all-or-nothing, unlike a document: a drawing with one unreadable element
is still a drawing and opens without it, while an edit with one unreadable element would do
something other than what it says.

A delete describes only its ids. What it needs in order to _undo_ is where the elements were,
and that is a fact about the document it ran against — so the far side captures its own, which
is the only version that would put them back in the right place there.

## 6. Tools

A tool is a small state machine handed a `ToolContext` (the drawing, a lookup, the viewport, the
pick tolerance, the active layer, and a snap function). It writes previews into interaction state
and produces **exactly one command** when an action completes — never a partial edit.

And when it has finished, it is finished: the next click starts something new rather than
changing what was just made. That sounds too obvious to write down, and it is written down
because the dimension tool broke it — it committed a measurement, stayed live, and quietly
carried that measurement across the drawing on the click meant for the next one. A tool that
keeps going says so while it is going: the wall tool draws the next wall under the pointer as
you move, and the block tool keeps a block on the cursor.

The preview is built with the same factory that commits the result, so what is on screen while
drawing cannot differ from what lands in the document.

Line, rectangle and circle are press–drag–release. The polygon collects clicks; clicking its
first vertex closes the ring, Enter or a double click finishes it open, Escape throws it away.

All four carry a **line type** — one of the eight conventions of NBR 8403 — chosen in the side
panel before the shape is drawn and kept for the next one, the way the wall tool keeps a
thickness. It goes onto the preview as well as the committed shape, which is the only way to
see before letting go that the right convention is selected: a centre line rubber-bands as a
centre line. Choosing _contínua larga_ writes nothing, because that is what these shapes are
drawn as anyway. §15 has what each type is and why the weight comes with it.

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
into spaces is in §19.

The area tool is the other way round: it is told an area and left to find a size. Type twelve
square metres, put a corner down, and the rectangle that follows the pointer holds those twelve
metres while its proportion changes — dragging further out along the same ray does nothing at
all, which is how a locked area says so without a word of interface. A second click puts four
walls round it.

The area asked for is the _inside_, because that is the floor somebody walks on and what an
area is ever asked for in, so the wall centrelines fall half a thickness outside the rectangle.
The proportion is read off the raw pointer rather than the snapped one — a grid line 20 mm away
is not a request for a differently shaped room — while the corner the room starts from is
snapped like any other click, because that is the point that wants to land on something.

Nothing records that an area was asked for. Four walls are what gets created, and the area the
room has is measured off them afterwards like every other value on the sheet. That matters most
where the grid rounds: 3.464 m square is exactly twelve metres and nobody builds it, 3.50 by
3.40 is 11.90 and somebody does — so the sides are rounded to the grid step and the status bar
says what that came to _before_ the click, rather than the request being quietly kept and
reported back.

The dimension tool takes three clicks, because a dimension is three decisions: what to
measure from, what to measure to, and which side of it the value is written on. The first two
go through the ordinary snap engine — endpoints and intersections are exactly what anyone
wants to measure between — and the third is read off the pointer as a signed offset, so the
line can be pulled out to either side. What it measures is never one of the decisions: the
value is read off the two points every time it is drawn, and there is no way to type over it.

Three clicks and it is finished. Holding Shift on that third one keeps the run live instead,
and each further click carries it on to another point: one dimension line, a value for each
step along it, and the parts adding up to the whole because they are parts of one mark rather
than a row of separate ones. Enter, Escape or a double click ends it.

Chaining was the default for a while, and it was wrong. The mark was committed on the third
click and the tool stayed live, so the next click — meant for a new measurement somewhere else
— silently carried the last one across the drawing instead, and the tool looked as though it
would not finish. A tool that says three clicks has to be finished after three clicks. The
chain is the rarer thing, and it is the one that asks for the extra key.

Three more marks follow the same rule, that a measurement stores what it measures and never
the number it came to. **Angle** takes the corner and a point along each of its two legs, and
measures the lesser of the two angles that corner offers. **Radius** takes one click on a
circle: where the click landed decides which way the leader points, the value is the circle's
own radius, and a switch in the properties panel makes it a diameter instead. Away from a
circle it does nothing at all, because a radius with nothing to be the radius of is not
something the format can express. **Leader** is the one that writes rather than measures: a
click on what the note is about, further clicks to bend the line, then Enter — and the words
are typed into the same floating field a label uses, for the same reason.

**Comment** is the only tool that commits nothing. A remark is not a thing anybody drew, so
it produces no command and never touches the document: the click decides the place, the words
go into a floating field the same way a label's do, and the result is a row in
`comment_threads`. Clicking a pin that is already there opens its conversation instead of
dropping a second one on top of it, and the point is deliberately not snapped — a snap is for
construction, and a remark is made where somebody was looking.

Typing `@` offers the people on the project and writes a whole name in. The picker is not
decoration: the server resolves a mention by matching a roster name in the text, so it is there
to put an exact name where somebody would otherwise spell it and wonder why nothing happened.
The client highlights what the server hands back and parses nothing.

Every edit made here is posted to the log, which numbers it and sends it on to everybody else
on the project's channel; each of them parses it with `parseCommand` and applies it through
`history.apply`, which changes the drawing without the edit joining their undo stack — undo
means "take back what I did". Undoing is an edit too: what leaves this browser is the
_inverse_ of the local command, described by the command itself, rather than a rewind of a
shared stack. **The post is the write and the broadcast is delivery**, so a
socket that is down turns co-editing into ordinary editing rather than into losing work. An
envelope describes state and never intent, which is what makes two people editing different
things converge without anybody negotiating, and what makes an echo harmless.

A remote cursor arrives at pointer rate and is **not** React state: it lands in a plain map
that the render loop reads, the same bargain a drag makes, so somebody else moving their mouse
costs zero renders. Who is _here_ changes rarely and does live in a store, because a strip of
names is React. See `presence/presence.ts` for why the two travel differently.

Somebody who may comment but not edit never sees this page. They get `pages/ReviewPage.tsx` —
the surface §14 built to look at a version on, given a click that means something. That was the
choice over handing them the editor with its tools removed, which would have meant teaching the
toolbar, the shortcut table, the panels, undo, the underlay dialog and the DXF import who was
looking, one at a time.

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
| `K`                            | comment                                  |
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
of elements still compares a handful. Alignments are the exception, and have to be: lining a
wall up with a corner across the room is the whole point of them, and that corner is nowhere
near the pointer. Those are gathered along the row and the column the pointer stands in,
clipped to what is on screen — a guide to something nobody can see is not a guide, and the
clip keeps it a walk along one row and one column of the index. Priority runs:

`endpoint → midpoint → intersection → alignment → grid`

An endpoint beats the grid however far away it is, because landing exactly on the corner of an
existing wall matters more than landing on a round number. The grid has no tolerance at all —
it always offers a candidate, so there is never a dead zone mid-cell where nothing snaps.

Not every reference carries the same weight. A point the tool has already placed holds the
pointer however close a grid line happens to be — keeping a wall horizontal from the corner it
starts at is the strongest intent there is, and losing it to a grid row 20 mm away would leave
the wall not horizontal. A corner somewhere else on screen is a hint rather than an intent, so
it has to be at least as near as the grid to win. Without that rule a plan with furniture in it
carries a row and a column through every edge of every block, and the grid effectively stops
applying: a line drawn in what looked like empty sheet came out 1.015 m long because a chest of
drawers across the room had a row through it.

Alignment locks only the coordinate that matched and draws a guide back to the point it lined
up with; the other coordinate still lands on the grid, because the grid always applies. An
alignment says _this_ coordinate is not yours to choose, not that the rest of the point stopped
being drafted — and a wall dragged along a guide that came out a fraction of a grid step long,
while the same wall dragged diagonally landed on the grid in both directions, was reported as
the grid not working. Tolerance is given in screen pixels and converted through the zoom, so
snapping feels identical at any magnification. A shape being dragged is excluded from its own
candidates — otherwise it would pin itself where it started.

Two things say where the point went. Each kind of snap has its own mark, because "you landed
on a corner" and "you are lined up with something over there" are different pieces of
information; the grid gets one too, quieter than the rest and only while a tool is placing
points, since that is when _your click lands here, not under your cursor_ is worth saying and
the rest of the time it would simply always be on. The coordinate readout says the same thing
in numbers: it follows the snapped point rather than the pointer, because a readout that
disagrees with where the editor is about to put something is a readout nobody can use. Turning
snap off — the toggle is in the same status bar — brings the raw position back. Beside it, and
only while a tool has something on the end of the pointer, is what that thing measures: a
wall's length and its angle, before the click that commits them. A wall is committed by the
click that ends it, so a length read afterwards in the properties panel is a correction rather
than a decision, and the number that decides where the click goes has to be on screen first.

### What snaps while something is dragged

The pointer's own snap answers "where is the cursor?", which is the wrong question once
something is in hand: what has to land exactly is a corner of the thing being moved, and the
cursor is wherever it happened to be grabbed. So a move offers every point of the dragged
selection to the snapper and applies the correction belonging to whichever one lands —
strongest kind first, and between two of the same kind the shorter correction, or a far corner
of the selection would drag it across the sheet.

Left to the pointer, a wall dragged up against another stops a few millimetres out: close
enough to look joined at any sensible zoom, far enough that the two are still two walls. Their
bands stay square and overlap at the corner instead of mitring into it (§19), and the room they
enclose is not the room it looks like.

Up to eight elements every point of every one of them is offered. Past that a drag is arranging
rather than connecting — nobody lines up forty elements by one of their corners — and asking
each corner where it would like to land costs a snap query on every pointer move, so beyond
that the pointer leads, as it always did.

## 9. Editing by value

The properties panel writes through `model/edits.ts`, a set of pure functions: type 3.42 into
the length field and `setSegmentLength` returns a wall 3.42 m long, keeping the `a` end put and
re-centring the local origin so rotation still pivots on the middle.

Every field commits through a command with a coalesce key of `field:elementId`, so an edit made
by typing undoes exactly like one made by dragging, and correcting a number twice in a row is
one history entry rather than two.

Two of the panel's rows are gated to the element types they mean something on, and the two
lists are not the same list. A **hatch** is offered on what encloses an area — a wall, a room,
a rectangle, a polygon, a circle — because a line has no inside to fill. A **line type** is
offered on the four shapes somebody draws for their own sake — a line, a rectangle, a polygon,
a circle — because a wall, an opening, a room and a dimension already mean what they mean by
being what they are.

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
than the plotter, rather than growing a curve primitive five renderers would have to learn.

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

## 11. The scene tree

The layers panel lists what is standing on each layer, and it is how somebody finds the label
that ended up behind a block.

**An element names itself.** Nothing in the format holds a name for one, and adding a field for
it would be a name that can go stale — the same reasoning that keeps a dimension from storing
its value. So `model/naming.ts` works one out: a text by its own words, a wall by how long it
is, a door by how it opens and how wide, a block by the block, a room by the area it measures.
A name somebody _types_ goes to `metadata.label`, a field that has been in the format since
version 1 and that nothing read until this panel; clearing it hands the row back to the
derived one.

**Hovering a row writes to `interaction` and asks for a repaint.** That is rule 5, and it is
also the only way a list this long stays usable: highlighting through React state would make
running a pointer down two hundred rows two hundred renders of the whole panel.

Layers are shut until they are opened, which is the whole of the performance story — several
hundred rows are rendered only when somebody asks for them, and the count on the layer says how
many that would be first. A layer nobody opens costs one row.

The panel also finally does what §3 of the document format has always said it does: create,
rename, recolour, reorder and delete a layer. Every one of those is in the document, so every
one is a command and undoes. Deleting a layer with something on it offers to move the contents
first, and the move and the deletion go into **one** command — an undo landing between them
would leave a layer gone and its contents somewhere nobody put them. The last layer never goes,
because every element in the format names the layer it belongs to.

## 12. Grid

The document's grid size is what snapping uses. The grid that is _drawn_ is the first multiple
of it (×1, ×2, ×5, by decade) still at least nine pixels apart, so zooming out thins the lines
out instead of turning them into a grey wash. Major lines every fifth minor one, and the drawing
origin is marked so absolute coordinates have something to refer to.

## 13. Saving

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

## 14. Versions

Autosave keeps the latest work; a version is a point someone chose to come back to. Creating
one flushes first, so the snapshot is of what is on screen rather than whatever the server
happened to be holding.

Restoring runs through `replaceDocument`, a command like any other — so going back to a version
is itself undoable. A restore is a decision someone can regret, and the drawing they left
should be one Ctrl+Z away rather than gone.

### Looking at one without restoring it

A version is looked at on a second, much smaller surface. `render/review.ts` owns everything it
paints — its own viewport, its own scene, no store at all — because putting a version into the
document store to look at it would mean the drawing being worked on is not the one on screen.
It paints through the same `buildScene` the editor and the exporters use, and leaves out the
paper: no grid, no sheet outline, no underlay, because nothing here is being drafted.

### Comparing two

A version is a whole document, so what changed between two of them is recorded nowhere and has
to be worked out. `model/diff.ts` does that structurally: elements matched by id, and anything
whose record is not identical reported along with the part of it that differs. Both sides go
through `parseDocument` first, so a schema 5 snapshot is compared as schema 6 and a migration
is never reported as somebody's work.

Two things it says that no element records. **A hosted opening does not change when its wall
does** — a door stores a distance along a wall, so the list says the wall changed while the
picture shows the door somewhere else, and both are true. And **order is a change even when
nothing else is**: within a layer, later elements paint on top, so restacking two overlapping
shapes alters the drawing without altering a single element.

What changed goes over the drawing as a redline (`render/redlines.ts`): outlines only, fills
dropped, one heavy pen, so a marked wall reads as a wall with a line round it rather than as a
wall painted green. **Dashed is a state that is gone** — something deleted, or where an edited
element used to be — and **solid is a state that is there now**. Saying it in the dash as well
as in the colour is the point: a redline that means something only in colour means nothing to a
good part of the people reading it, which is also why every mark appears in the list beside it
in words, and why that list is the thing the keyboard reaches.

Hidden layers are drawn on that surface, unlike anywhere else in the editor. It is a comparison
of two documents rather than a drawing, and one that leaves half of a version out is not a
comparison — while a mark over geometry nobody can see would be worse than either.

## 15. One drawing, five outputs

`scene/build.ts` turns the document into primitives — polylines, circles, ellipses, arcs and
text, in world millimetres. It is the only place that knows what a wall with a door in it looks
like, and five consumers read it:

```
document ──▶ scene ──┬──▶ canvas          the screen
                     ├──▶ canvas @ N×     PNG
                     ├──▶ SVG             a file, layers intact
                     ├──▶ pdf-lib         a page at a real scale
                     └──▶ DXF             full size, for other software to edit
```

Writing that geometry five times would guarantee five slightly different answers. This way a
PDF cannot disagree with what was on screen.

The distinction the scene carries that matters most is between a **line** and an **area**. A
stroke is always a plotted pen weight — millimetres on the finished sheet — so it stays a
constant thickness on screen however far you zoom, and prints at that width whatever the
drawing's scale. Each output converts that its own way; nothing else has to think about it.
Anything with a real dimension is an area: a wall's poché is 150 mm across because the wall
is, so it is filled rather than stroked and gets smaller as you zoom out, the way the wall
does.

Which weight, and whether the stroke has gaps in it, is decided two ways. What the editor
draws for its own reasons — a wall, an opening, a room, a dimension — is drawn at the weights
`scene/types.ts` holds, because what those mean is already decided by what they are. The four
shapes somebody draws for their own sake — a line, a rectangle, a polygon and a circle — take
theirs from a **line type**: one of the eight conventions of NBR 8403 in `model/lineTypes.ts`,
each of them a dash pattern and a weight together, since the standard names a line once.
Naming none is _contínua larga_, which is what all four were always drawn as. A dash is
measured on the sheet like the pen weight beside it, so a centre line reads the same at 1:50
and at 1:100.

It was a fat stroke until walls learned to meet each other. A stroke has two ends and they are
square, which is fine until two walls turn a corner and the outside of it is a notch neither
of them reaches into. Mitring says where each face of each band really stops, and that shape
is a quadrilateral, not a line — see §19.

Four of those outputs are pictures. DXF is not, and that changes what faithful means. It is
still written from the scene, so a wall leaves as the shape a wall is drawn as — an outline
with its openings cut — rather than as a wall, because a DXF has no idea what one is. What
travels is geometry on layers at full size. Pen weights, fills and the page stay behind: the
R12 dialect that opens everywhere has nowhere to put a lineweight or a hatch, and model space
has no paper to print on — scale is a decision about paper, which is what the PDF is for.

Hidden layers are absent from the scene, so hiding a layer hides it in an export too. A wall's
openings come only from openings on visible layers, which is why hiding _Openings_ gives solid
walls rather than walls full of holes with nothing in them.

## 16. Export

SVG is written in world millimetres with `width` and `height` set to the drawing divided by its
scale, so a 1:50 file opens at a fiftieth of the building anywhere. Layers survive as groups.

PDF is a real page. The scale is never quietly adjusted to make a drawing fit: it steps to the
next standard ratio, the title block says which one was used, and a scale bar gives the reader
something to measure even if the page was resized on the way to them. pdf-lib is around 350 kB
and most sessions never export a PDF, so it is imported at the moment someone asks for one.

What surrounds the drawing is a sheet rather than a caption. A border encloses the drawing and
the 26 mm band beneath it — the strip `layoutSheet` takes off the drawing area, on screen as
well as in the print — and a rule in full ink divides the two. The band is a stamp: the mark in
a cell at the left, then the drawing's name, the document it came from and the scale bar, then
the job's facts in labelled cells, two to a column. A long name is set smaller before it is cut
short, and a field nobody filled in is dropped label and all, so a stamp closes up rather than
printing empty boxes. It is drawn by `export/furniture.ts`; `export/pdf.ts` is the geometry.

Down the right-hand side goes what the drawing cannot say in geometry, stacked in three:
`settings.notes` at the top, one note to a line and numbered when there is more than one; then
the **key**; then a legend naming the layers, pinned to the bottom. That strip is paid for in
drawing area rather than taken out of the margins — it narrows the frame, and the scale steps
back if the plan no longer fits — so it is only reserved when there is something to print in
it: a note somebody wrote, a legend of more than one layer, or a single convention to decode.
`sheetAside` is the one place that decides, and both the canvas outline and the print ask it,
because an outline that reserved a strip the print does not promises room the print has not
got.

The key is what the marks on this sheet mean: every hatch and every line type the drawing
actually uses, gathered by `model/conventions.ts` from the elements — the scene has forgotten
which convention its geometry came from, since a hatch leaves it as clipped lines. Hatches
first, then line types, each in catalogue order rather than in order of appearance, so two
sheets of one set can be read against each other. A hatch is named by what it is, because
"existing masonry" is both what it is called and what it says; a line type is named by what it
is _for_, because "Dashed, narrow" printed beside a dashed line explains nothing. Each row
carries the mark itself, drawn from the same three clipping functions the scene uses and at
exactly the size it is drawn on the sheet — a swatch at any other size is a picture of a
different convention. A line type nobody named is not listed: absent means contínua larga, and
a reader meeting a plain continuous line is not looking anything up.

Notes that would run into the key are cut off at the last line that fits, and say so. Where the
strip is too short for everything, the key gives way first and marks the cut, because a note is
prose somebody wrote for this sheet and exists nowhere else while a key can be read off the
drawing again.

PNG is the same scene on an off-screen canvas at a chosen size. Pen weights follow the zoom, so
a larger export gets crisper lines rather than thicker ones.

One thing does not come free from sharing a scene: **alignment**. The canvas has `textAlign`
and SVG has `text-anchor`, and both apply it in the text's own frame, after any rotation. A PDF
has neither — `drawText` starts the baseline at the point it is given and rotates the run about
that point — so the exporter centres the text itself, and the shift has to travel along the
text's own baseline. Along the page's x axis it is the same direction only while the text is
horizontal, which is why vertical dimensions were the only thing in the drawing that came out
of the PDF sitting beside their line instead of on it.

## 17. Reach

The chrome is keyboard-operable throughout. The tool rail follows the ARIA toolbar pattern —
one tab stop, arrow keys within it — the canvas is focusable and shows a focus ring when it is
reached by keyboard rather than by pointer, and each page carries a skip link straight to its
content. Every colour pair the interface paints is held to WCAG 2.1 AA by `ui/contrast.test.ts`,
which reads the tokens out of the stylesheet rather than a copy of them: 4.5:1 for text, 3:1
for the edges of controls. That test is what pushed `ink-subtle` and the control border darker
than they were first drawn.

Below the `lg` breakpoint the editor is not merely hidden — it is not mounted, so a phone does
not start a render loop for a canvas nobody can draw on.

## 18. Tracing over a PDF

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

## 19. Where walls meet

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

### The two faces, and which one is inside

A mitred wall has three lengths. The centreline is what was drawn and what gets typed into;
each face is longer or shorter than it by whatever the corners at its ends did. A 4.00 m wall
in two 150 mm corners measures 3.85 m along the inside and 4.15 m along the outside, and those
are the two numbers somebody setting the job out actually measures. `wallFaces` reads them off
the band, which has held all four of its corners since walls learned to mitre — nothing new is
computed, it was simply thrown away once the poché was filled.

Which face is _inside_ is not a question the wall can answer. The order `a → b` happened to be
drawn in says nothing about buildings, so each side is probed a millimetre off its face and
asked whether the walls close a space around that point — the same walk that finds a room.
Inside and outside are used only where exactly one side says yes. A partition with a room on
either side has two insides and no outside, and a garden wall has neither; both of those have
their sides named by which way they face, because calling one of them "inside" would be
stating something the drawing does not say.

Both faces are offered to the snapper as well, along with the four corners of the band, so a
dimension can be taken to a face — which is what a drafter dimensions to, and what the
centreline is not. They go in through the candidate gatherer rather than through
`elementWorldPoints`, because that also decides an element's extent, what a box selection
catches and what a DXF is written from, and a wall is not six points wide to any of those.

### Filling a shape

A hatch is what a drawing says a thing is made of, or what is about to happen to it, and it is
**geometry rather than a fill pattern**. The alternative is a `CanvasPattern` on screen, an SVG
`<pattern>`, a tiling pattern in the PDF and nothing at all in the DXF — four implementations
of one drawing, which guarantees four slightly different drawings and is the thing a single
scene exists to prevent. R12 has no `HATCH` either. Clipped lines are what all five readers
draw identically, and what a hatch explodes to on arrival anywhere else.

`geometry/hatch.ts` does the clipping and knows nothing about pens, scale or zoom. Lines are
scanned in the hatch's own frame — the rings turned so the lines run flat, every straddling
edge contributing a crossing, the crossings paired off along it — which is even-odd, and why
it takes rings rather than a polygon: a shape with a hole comes out with the hole empty. The
lattice sits on half multiples of the spacing and is anchored to the origin rather than to
each shape, so a run of walls shares one set of lines instead of reading as several hatches
butted together, and no line lands along an edge it would only thicken.

A stipple is a jittered grid, and its jitter is **pseudo-random from a seed the element gives
it**. That is not a detail: a concrete wall that speckles differently every frame shimmers as
the drawing pans, and one that speckles differently in the PDF than it did on screen is not
the drawing anybody looked at.

Spacings are in millimetres **on the sheet**, like a pen weight — none of these patterns
represents a real size, so the scale converts them at build time and a wall speckles the same
on an A3 at 1:50 as at 1:100. On screen a hatch finer than about two pixels is not drawn at
all, because below that it is a grey rectangle that costs a frame and says nothing; paper has
no zoom, so an exporter culls nothing. Past a ceiling of segments per shape the spacing is
doubled until it fits, which is something a person can see and correct rather than a freeze
they cannot.

Walls are grouped by their layer **and** by what fills them. They are merged into one filled
shape so that two fills sharing an edge do not leave a seam at every mitre — but merging a run
coming down with a run staying up would say they were the same masonry, which is the one thing
a renovation drawing exists to distinguish. The cost of that is visible: a hatched run shows
the mitre between one wall and the next, because merging the boundary needs a polygon union
nothing else here has any call for, and a joint line is a smaller wrong than a hatch with no
edge round it.

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

## 20. What is not here yet

Anything that happens between two people at the same time: presence, cursors, live
co-editing. Phase 9 is finished: comparing two versions, roles and the
membership a link grants, comments with mentions, presence, and live co-editing — an edit made
by one person reaching everybody else's drawing in an order they all agree on, undo included.

What is genuinely not here is a CRDT. Two people editing the same element resolve to whichever
edit the log accepted last, per element, which is a rule you can explain to somebody and which
is enough for two drafters working on one plan. It is not enough for merging two long offline
sessions, and nothing here pretends otherwise. See [roadmap.md](roadmap.md).
