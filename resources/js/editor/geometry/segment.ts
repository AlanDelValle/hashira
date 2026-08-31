import {
    add,
    clamp,
    cross,
    distance,
    dot,
    lengthSquared,
    scale,
    subtract,
    type Point,
} from './vec';

export interface Segment {
    a: Point;
    b: Point;
}

/**
 * The point on the segment nearest `p`. Clamped to the endpoints, so this answers "where
 * would the pointer land on this wall", not "where does the infinite line come closest".
 */
export function closestPointOnSegment(segment: Segment, p: Point): Point {
    const direction = subtract(segment.b, segment.a);
    const lengthSq = lengthSquared(direction);

    if (lengthSq === 0) {
        return { ...segment.a };
    }

    const t = clamp(dot(subtract(p, segment.a), direction) / lengthSq, 0, 1);

    return add(segment.a, scale(direction, t));
}

export function distanceToSegment(segment: Segment, p: Point): number {
    return distance(closestPointOnSegment(segment, p), p);
}

/** How far along the segment the nearest point sits, as a fraction from 0 at `a` to 1 at `b`. */
export function parameterAlongSegment(segment: Segment, p: Point): number {
    const direction = subtract(segment.b, segment.a);
    const lengthSq = lengthSquared(direction);

    if (lengthSq === 0) {
        return 0;
    }

    return clamp(dot(subtract(p, segment.a), direction) / lengthSq, 0, 1);
}

/**
 * Where two segments cross, or null when they are parallel or only meet on an extension of
 * one of them. Endpoints count as a crossing — two walls meeting at a corner do intersect.
 */
export function intersectSegments(first: Segment, second: Segment): Point | null {
    const r = subtract(first.b, first.a);
    const s = subtract(second.b, second.a);
    const denominator = cross(r, s);

    if (denominator === 0) {
        return null; // Parallel, collinear included: no single crossing point.
    }

    const offset = subtract(second.a, first.a);
    const t = cross(offset, s) / denominator;
    const u = cross(offset, r) / denominator;

    if (t < 0 || t > 1 || u < 0 || u > 1) {
        return null;
    }

    return add(first.a, scale(r, t));
}

/**
 * Where two infinite lines cross, given a point on each and the direction it runs in.
 *
 * Unlike `intersectSegments` this does not care whether the crossing lies between the points
 * that defined the lines, which is exactly what mitring a corner needs: the two wall faces
 * meet past the end of both of them.
 */
export function intersectLines(
    a: Point,
    alongA: Point,
    b: Point,
    alongB: Point,
    epsilon = 1e-9,
): Point | null {
    const denominator = cross(alongA, alongB);

    if (Math.abs(denominator) <= epsilon) {
        return null; // Parallel: no single crossing point, or every point.
    }

    return add(a, scale(alongA, cross(subtract(b, a), alongB) / denominator));
}

export function segmentLength(segment: Segment): number {
    return distance(segment.a, segment.b);
}
