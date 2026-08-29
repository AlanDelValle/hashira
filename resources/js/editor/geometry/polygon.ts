import { distanceToSegment } from './segment';
import type { Point } from './vec';

/**
 * Signed area: positive when the vertices wind clockwise in screen space, where Y grows
 * downward. The sign matters for orientation; callers wanting an area use `polygonArea`.
 */
export function signedPolygonArea(points: readonly Point[]): number {
    if (points.length < 3) {
        return 0;
    }

    let sum = 0;

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];

        if (current === undefined || next === undefined) continue;

        sum += current.x * next.y - next.x * current.y;
    }

    return sum / 2;
}

export function polygonArea(points: readonly Point[]): number {
    return Math.abs(signedPolygonArea(points));
}

/**
 * Ray casting, counting crossings of a ray heading in +X. Points exactly on an edge are not
 * guaranteed either way, which is why hit-testing checks the outline separately.
 */
export function pointInPolygon(points: readonly Point[], p: Point): boolean {
    if (points.length < 3) {
        return false;
    }

    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];

        if (a === undefined || b === undefined) continue;

        const straddles = a.y > p.y !== b.y > p.y;

        if (straddles && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }

    return inside;
}

/** Distance from `p` to the nearest edge, treating the ring as closed when asked. */
export function distanceToPolyline(points: readonly Point[], p: Point, closed: boolean): number {
    if (points.length === 0) {
        return Infinity;
    }

    const first = points[0];

    if (points.length === 1 && first !== undefined) {
        return Math.hypot(p.x - first.x, p.y - first.y);
    }

    let nearest = Infinity;
    const last = closed ? points.length : points.length - 1;

    for (let i = 0; i < last; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        if (a === undefined || b === undefined) continue;

        nearest = Math.min(nearest, distanceToSegment({ a, b }, p));
    }

    return nearest;
}

export function polygonCentroid(points: readonly Point[]): Point | null {
    const first = points[0];

    if (first === undefined) {
        return null;
    }

    const area = signedPolygonArea(points);

    // A degenerate ring (all collinear, or fewer than three points) has no centroid to
    // compute; the average of the vertices is the useful answer there.
    if (area === 0) {
        let x = 0;
        let y = 0;

        for (const p of points) {
            x += p.x;
            y += p.y;
        }

        return { x: x / points.length, y: y / points.length };
    }

    let x = 0;
    let y = 0;

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];

        if (current === undefined || next === undefined) continue;

        const factor = current.x * next.y - next.x * current.y;
        x += (current.x + next.x) * factor;
        y += (current.y + next.y) * factor;
    }

    return { x: x / (6 * area), y: y / (6 * area) };
}
