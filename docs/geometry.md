# Geometry

`resources/js/editor/geometry/` is pure maths: plain functions over plain objects, no classes,
no mutation, no DOM. It is the layer the rest of the editor is built on, and the one place where
a subtle error would quietly corrupt drawings — so it carries the densest tests in the project.

---

## 1. Conventions

- **Millimetres.** Every length and coordinate. Pixels exist only in the viewport transform.
- **Y grows downward**, matching the screen. A floor plan is drawn looking down at it, so this
  costs nothing and saves a flip in every painter.
- **Angles are radians, clockwise positive**, because of that Y direction. Degrees exist only
  in the interface, converted at the edge by `model/units.ts`.
- **Nothing throws.** Degenerate input — a zero-length segment, an empty point list, a
  self-overlapping ring — returns a defined answer. Drawing tools produce degenerate geometry
  constantly while the pointer is still moving.

## 2. The modules

### `vec.ts`

Points and vectors: `add`, `subtract`, `scale`, `dot`, `cross`, `length`, `distance`,
`normalize`, `perpendicular`, `lerp`, `midpoint`, `rotate`, `rotateAround`, `angleOf`,
`angleBetween`.

`normalize` returns the zero vector unchanged rather than dividing by zero — the case that
arises every time a drag begins and the pointer has not moved yet.

`cross` returns the z component of the 3D cross product. Its sign is which side of a line a
point falls on, which is what segment intersection and polygon winding are built from.

### `angle.ts`

`normalizeAngle` wraps into (−π, π], preferring `+π` for a half turn so a formatted angle reads
180° rather than −180°. `snapAngle` rounds to an increment — what Shift does while drawing.

### `segment.ts`

`closestPointOnSegment` clamps to the endpoints, so it answers "where on this wall is the
pointer" rather than "where does the infinite line come closest". `distanceToSegment` is the
core of picking walls and lines.

`intersectSegments` returns the crossing point or null. Parallel segments — collinear included —
have no single crossing and return null. Meeting at a shared endpoint _is_ a crossing: two walls
at a corner do intersect, and Phase 3's snapping needs that point.

### `polygon.ts`

`signedPolygonArea` keeps its sign for orientation; `polygonArea` is its magnitude.
`pointInPolygon` is ray casting. `distanceToPolyline` measures to the nearest edge, treating the
ring as closed only when asked — which is exactly the difference between a polygon and a
polyline for hit-testing.

`polygonCentroid` falls back to the average of the vertices for a degenerate ring, where the
area-weighted formula divides by zero.

### `bbox.ts`

Axis-aligned bounds, and the two containment tests that rubber-band selection is built on:
`boundsContain` (entirely inside — a window selection) and `boundsIntersect` (touching at all —
a crossing selection).

## 3. What is deliberately absent

No boolean operations, no offsetting, no convex hulls, no triangulation, no curve maths. The MVP
does not need them, and each is a well-known source of numerical grief. When one becomes
necessary — wall joins at corners are the first candidate, in Phase 7 — the choice will be to
adopt a mature library rather than hand-roll it, following the rule in
[CONTRIBUTING.md](../CONTRIBUTING.md): our own code for the easy problems, a library for the
genuinely hard ones.

## 4. Tests

`geometry.test.ts` covers the behaviours above, and states the awkward cases explicitly rather
than leaving them implied: the degenerate segment, the corner crossing, the parallel miss, the
open-versus-closed ring, and containment versus intersection. Those are the cases a future
refactor is most likely to break.
