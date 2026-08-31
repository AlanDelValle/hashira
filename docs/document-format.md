# Document format — schema version 4

The document is the single source of truth for a drawing. It is plain JSON: no functions,
no class instances, no references to DOM or React. It is what the API stores in
`documents.data`, what autosave sends, what versions snapshot, and what the exporters read.

Two rules make everything else predictable:

1. **All lengths and coordinates are millimetres.** `settings.unit` is a display preference.
2. **All angles are radians, clockwise positive** (Y grows downward). The UI shows degrees.

---

## 1. Top level

```jsonc
{
  "schemaVersion": 4,
  "id": "01JBQ8...", // ULID, stable for the life of the drawing
  "name": "Ground floor",
  "settings": {/* §2 */},
  "layers": [/* §3 */],
  "elements": [/* §4 */],
}
```

`elements` is ordered; within a layer, later elements paint on top. Cross-layer ordering is
determined by `layer.order`, not by array position.

---

## 2. Settings

```jsonc
{
  "unit": "m", // "mm" | "cm" | "m" — display only
  "scale": 50, // 1:50, used for export and the scale bar
  "grid": {
    "size": 100, // mm between major grid lines
    "subdivisions": 2,
    "visible": true,
    "snap": true,
  },
  "snapping": {
    "enabled": true,
    "endpoint": true,
    "midpoint": true,
    "intersection": true,
    "axis": true,
  },
  "sheet": { "size": "A3", "orientation": "landscape" },
  "title": "Ground floor — 1:50", // printed in the export title block
}
```

Grid presets offered in the UI: 50 mm, 100 mm, 250 mm, 500 mm, 1000 mm.

---

## 3. Layers

```jsonc
{
  "id": "layer_architecture",
  "name": "Architecture",
  "color": "#1F2328",
  "visible": true,
  "locked": false,
  "order": 0,
}
```

Every document is created with five layers, in this order: `architecture`, `openings`,
`furniture`, `dimensions`, `annotations`. A locked layer is rendered but cannot be selected
or edited. A hidden layer is skipped entirely, including by hit-testing and export.

Deleting a layer is only permitted when it is empty; the UI offers to move its contents
first. This keeps `layerId` a guaranteed-valid reference.

---

## 4. Elements

Every element shares the same envelope:

```jsonc
{
  "id": "01JBQ9...",
  "type": "wall",
  "layerId": "layer_architecture",
  "transform": { "x": 0, "y": 0, "rotation": 0 },
  "geometry": {/* type specific, in LOCAL coordinates */},
  "style": {/* optional overrides of the layer defaults */},
  "metadata": { "createdAt": "2026-08-29T12:00:00Z", "label": null },
}
```

### 4.1 Local space and the transform

`geometry` is expressed in the element's **local** space. `transform` maps local → world:

```
world = rotate(local, rotation) + { x, y }
```

Rotation pivots around the local origin, and every factory places that origin at the element's
own centre — so `transform.x/y` is where the element _is_, and a rotation handle turns it about
itself rather than swinging it around the drawing origin.

Moving an element therefore edits two numbers instead of rewriting every vertex, which is what
makes dragging a 100-vertex polygon cheap. A document written by hand with absolute points and
an identity transform still reads correctly; it simply rotates about its own first point.

A single helper, `worldPoints(element)`, is the only sanctioned way to read an element's
world geometry. Renderer, snapping, hit-testing and exporters all go through it.

### 4.2 Types

| `type`      | `geometry`                                  | Notes                         |
| ----------- | ------------------------------------------- | ----------------------------- |
| `wall`      | `{ a: Point, b: Point, thickness: number }` | thickness defaults to 150 mm  |
| `line`      | `{ a: Point, b: Point }`                    |                               |
| `rect`      | `{ width: number, height: number }`         | local origin at the centre    |
| `circle`    | `{ radius: number }`                        | local origin at the centre    |
| `polygon`   | `{ points: Point[], closed: boolean }`      |                               |
| `room`      | `{ points: Point[] }`                       | area is derived, never stored |
| `door`      | `{ hostId, offset, width, swing, flipped }` | hosted on a wall — §4.5       |
| `window`    | `{ hostId, offset, width }`                 | hosted on a wall — §4.5       |
| `text`      | `{ content, fontSize, align }`              | `fontSize` in mm at 1:1       |
| `dimension` | `{ points, offset, fontSize }`              | the values are derived — §4.3 |
| `angle`     | `{ vertex, from, to, radius, fontSize }`    | the value is derived — §4.4   |
| `radius`    | `{ hostId, angle, diameter, fontSize }`     | hosted on a circle — §4.4     |
| `leader`    | `{ points, content, fontSize }`             | a note, and a line to it      |
| `underlay`  | `{ underlayId, width, height, opacity }`    | a page to trace over — §4.8   |

`Point` is `{ "x": number, "y": number }`.

An earlier draft of this document said a new element type was additive and needed no version
bump. That was wrong, and `dimension` is why. A reader that predates a type does not ignore
it — it drops it, because dropping what it cannot parse is exactly how it protects the rest
of the drawing. It would then autosave the drawing back without the dimensions in it. Adding
an element type is therefore a version bump like any other change older readers cannot
handle: they must refuse the file rather than quietly empty it.

### 4.3 Dimensions

A `dimension` stores the points it measures and nothing else about the measurement:

- `points` — two or more measured points, in the element's local space like any other
  geometry. Each consecutive pair is a measurement of its own and they all share one
  dimension line, which is what a chain of dimensions is,
- `offset` — how far that line sits from them, along the perpendicular. Signed, so which side
  it goes on is a decision rather than a consequence of the point order,
- `fontSize` — cap height of the values, in millimetres at 1:1, like `text`.

A chain measures **along its own run**: every point is projected onto the line from the first
to the last, and each value is the distance between neighbouring projections. Points picked
off a drawing are never perfectly in line, and a chain whose parts do not add up to its whole
is a chain nobody can check.

**The measured values are never stored.** They are read off the points every time the
dimension is drawn, in the document's display unit. A stored value is a number that can come
to disagree with the geometry it describes, and a drawing that states one length while showing
another is worse than one with no dimension at all. It also means there is deliberately no
way to type over a dimension: the properties panel shows what it measures and will not let
you edit it.

### 4.4 Angles, radii and notes

The same rule decides the shape of the other three marks: store what is being measured, never
the number it came to.

An `angle` stores its corner and a point on each of the two legs leaving it — points rather
than directions, so the measurement is of two places in the drawing and follows them when
they move. `radius` is how far out from the corner the arc is struck; it is drawing, not
measurement. The lesser of the two angles is the one measured, because the reflex angle is
not what anybody means by a corner.

A `radius` is **hosted**, like an opening (§4.5): it stores `hostId` — the id of a `circle` —
along with `angle`, the direction its leader points out of the centre, and `diameter`,
whether it measures across the circle rather than out from the middle. Resizing or moving the
circle takes the measurement with it. A `radius` whose host no longer resolves is dropped on
load, exactly as an orphaned opening is.

A `leader` is the one annotation whose words are the content rather than something derived:
`points` runs from the thing being annotated to where the note is written, with as many bends
as were drawn, and `content` is the note. A leader with nothing written on it is refused —
a line pointing at something for no stated reason is not an annotation.

### 4.8 Underlays

An `underlay` is a page of an imported PDF, rasterised and placed at a size, to trace over.
It stores `underlayId` — which page, uploaded separately — along with the size it is drawn at
and the `opacity` it is drawn back to. Like a block, the picture itself is never in the
document: a drawing is kilobytes and a rasterised A1 is megabytes, and putting one inside the
other would make every autosave carry the survey again.

It is the one thing in a drawing that is not _of_ the drawing, and two rules follow from that:

- **It is never exported.** The scene every output consumes has no underlay in it. What an
  underlay holds is usually somebody else's survey, and a plan that quietly carries it into a
  PDF is a plan nobody can publish.
- **It is not part of what a share link hands out.** A link gives away the drawing. The pages
  it was traced from stay with the project, behind the same policy as everything else.

A reader that cannot resolve the id draws nothing at all rather than a placeholder, for the
same reason: an outline where a page would be advertises a document that is not being given.

### 4.5 Hosted openings

Doors and windows are not free-floating rectangles. They store:

- `hostId` — the `id` of a `wall` element,
- `offset` — the distance in millimetres from the wall's `a` endpoint to the opening's centre,
- `width` — the clear opening width.

The opening's world position is derived from its host, so moving or rotating the wall moves
the opening with it, and dragging an opening constrains it to slide along its wall. The wall
painter subtracts every hosted opening from the wall's poché.

An opening whose `hostId` no longer resolves is dropped on load, with a warning — see §6.

### 4.6 Library blocks

An `asset` records _which_ block and how big it is, never the block's geometry:

```jsonc
{ "assetId": "sofa-3", "width": 2100, "height": 900, "mirrored": false }
```

The drawing of a sofa lives once in the editor's library, in a normalised 0–1 box scaled to
whatever size the element carries. A plan therefore never stores a few hundred coordinates for
a piece of furniture, the same block can be any size without a second definition, and
correcting a block improves every drawing that uses it.

An `assetId` the reader does not know is not dropped: its footprint is drawn as a dashed
rectangle, because a block someone placed still occupies that space.

### 4.7 Style

```jsonc
{ "stroke": "#1F2328", "fill": null, "strokeWidth": 0.35, "dash": null }
```

All fields are optional; anything absent falls back to the layer, then to the document
theme. `strokeWidth` is in millimetres _on the printed sheet_ (a 0.35 mm pen), not in world
millimetres — so line weights stay constant as you zoom and match the plotted output.

---

## 5. A minimal but complete document

```json
{
  "schemaVersion": 4,
  "id": "01JBQ8ZK4T0000000000000000",
  "name": "Studio",
  "settings": {
    "unit": "m",
    "scale": 50,
    "grid": { "size": 100, "subdivisions": 2, "visible": true, "snap": true },
    "snapping": {
      "enabled": true,
      "endpoint": true,
      "midpoint": true,
      "intersection": true,
      "axis": true
    },
    "sheet": { "size": "A3", "orientation": "landscape" },
    "title": "Studio"
  },
  "layers": [
    {
      "id": "layer_architecture",
      "name": "Architecture",
      "color": "#1F2328",
      "visible": true,
      "locked": false,
      "order": 0
    },
    {
      "id": "layer_openings",
      "name": "Openings",
      "color": "#1F2328",
      "visible": true,
      "locked": false,
      "order": 1
    }
  ],
  "elements": [
    {
      "id": "01JBQ9A0000000000000000001",
      "type": "wall",
      "layerId": "layer_architecture",
      "transform": { "x": 0, "y": 0, "rotation": 0 },
      "geometry": { "a": { "x": 0, "y": 0 }, "b": { "x": 4000, "y": 0 }, "thickness": 150 },
      "metadata": { "createdAt": "2026-08-29T12:00:00Z" }
    },
    {
      "id": "01JBQ9A0000000000000000002",
      "type": "door",
      "layerId": "layer_openings",
      "transform": { "x": 0, "y": 0, "rotation": 0 },
      "geometry": {
        "hostId": "01JBQ9A0000000000000000001",
        "offset": 1200,
        "width": 800,
        "swing": "left",
        "flipped": false
      },
      "metadata": { "createdAt": "2026-08-29T12:00:05Z" }
    }
  ]
}
```

---

## 6. Versioning and loading

`schemaVersion` is an integer that increases whenever the shape changes in a way older
readers cannot handle. Loading is a pipeline:

```
raw JSON → version check → migration chain → zod validation → HashiraDocument
```

- **Older version** — run each migration in sequence (`v1→v2`, `v2→v3`, …). Migrations are
  pure functions and each ships with a fixture test written as literal JSON, so it holds on
  to what an older Hashira really wrote rather than to what today's factories would produce.
- **Newer version than this build knows** — refuse to open and say so, rather than silently
  discarding fields the user's other device wrote.
- **Structurally invalid** — reject with the validation path. We never half-load a drawing.
- **Individually broken elements** (a dangling `hostId`, an unknown `layerId`) — dropped,
  counted, and reported once in the UI. One corrupt element must not cost you the plan.

Validation uses a zod schema derived from the same TypeScript types the editor uses, so the
runtime contract and the compile-time contract cannot drift apart.

### 6.1 History

| Version | Change                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | The original format.                                                                                                                                                                                                            |
| 2       | Added the `dimension` element; nothing already written changes shape, so the step handed drawings forward unchanged.                                                                                                            |
| 3       | A dimension became a run of `points` rather than a pair `a`/`b`, and `angle`, `radius` and `leader` joined it. Every dimension ever written has exactly two points, which is a chain of one.                                    |
| 4       | Added the `underlay`: a page to trace over. Nothing already written changes shape, so the step restamps the version — but a reader that predates the type would drop every underlay in a drawing and save it back without them. |

---

## 7. Stability guarantees

Within a major schema version we will only ever **add** optional fields. Renaming or
removing a field, changing a unit, or changing the meaning of `transform` requires a version
bump and a migration. Documents are user data; treating the format casually is how you lose
someone's drawing.
