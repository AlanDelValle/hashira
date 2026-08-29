# Document format — schema version 1

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
  "schemaVersion": 1,
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

| `type`    | `geometry`                                  | Notes                         |
| --------- | ------------------------------------------- | ----------------------------- |
| `wall`    | `{ a: Point, b: Point, thickness: number }` | thickness defaults to 150 mm  |
| `line`    | `{ a: Point, b: Point }`                    |                               |
| `rect`    | `{ width: number, height: number }`         | local origin at the centre    |
| `circle`  | `{ radius: number }`                        | local origin at the centre    |
| `polygon` | `{ points: Point[], closed: boolean }`      |                               |
| `room`    | `{ points: Point[] }`                       | area is derived, never stored |
| `door`    | `{ hostId, offset, width, swing, flipped }` | hosted on a wall — §4.3       |
| `window`  | `{ hostId, offset, width }`                 | hosted on a wall — §4.3       |
| `text`    | `{ content, fontSize, align }`              | `fontSize` in mm at 1:1       |

`Point` is `{ "x": number, "y": number }`.

Dimensions and markers are not element types yet. Adding a type is additive and needs no
version bump, so each arrives with the phase that draws it.

### 4.3 Hosted openings

Doors and windows are not free-floating rectangles. They store:

- `hostId` — the `id` of a `wall` element,
- `offset` — the distance in millimetres from the wall's `a` endpoint to the opening's centre,
- `width` — the clear opening width.

The opening's world position is derived from its host, so moving or rotating the wall moves
the opening with it, and dragging an opening constrains it to slide along its wall. The wall
painter subtracts every hosted opening from the wall's poché.

An opening whose `hostId` no longer resolves is dropped on load, with a warning — see §6.

### 4.5 Library blocks

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

### 4.4 Style

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
  "schemaVersion": 1,
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
  pure functions and each ships with a fixture test.
- **Newer version than this build knows** — refuse to open and say so, rather than silently
  discarding fields the user's other device wrote.
- **Structurally invalid** — reject with the validation path. We never half-load a drawing.
- **Individually broken elements** (a dangling `hostId`, an unknown `layerId`) — dropped,
  counted, and reported once in the UI. One corrupt element must not cost you the plan.

Validation uses a zod schema derived from the same TypeScript types the editor uses, so the
runtime contract and the compile-time contract cannot drift apart.

---

## 7. Stability guarantees

Within a major schema version we will only ever **add** optional fields. Renaming or
removing a field, changing a unit, or changing the meaning of `transform` requires a version
bump and a migration. Documents are user data; treating the format casually is how you lose
someone's drawing.
