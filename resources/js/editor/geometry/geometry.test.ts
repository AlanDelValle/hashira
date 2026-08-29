import { describe, expect, it } from 'vitest';

import { normalizeAngle, snapAngle, toDegrees, toRadians } from './angle';
import { boundsContain, boundsFromCorners, boundsFromPoints, boundsIntersect } from './bbox';
import { distanceToPolyline, pointInPolygon, polygonArea, polygonCentroid } from './polygon';
import { closestPointOnSegment, distanceToSegment, intersectSegments } from './segment';
import { angleBetween, normalize, point, rotate, rotateAround } from './vec';

describe('vectors', () => {
    it('rotates a quarter turn clockwise, because Y grows downward', () => {
        const rotated = rotate(point(10, 0), Math.PI / 2);

        expect(rotated.x).toBeCloseTo(0);
        expect(rotated.y).toBeCloseTo(10);
    });

    it('rotates about a pivot without moving the pivot', () => {
        const pivot = point(100, 100);

        expect(rotateAround(pivot, pivot, 1.234)).toEqual(pivot);

        const rotated = rotateAround(point(200, 100), pivot, Math.PI);
        expect(rotated.x).toBeCloseTo(0);
        expect(rotated.y).toBeCloseTo(100);
    });

    it('normalises the zero vector to zero rather than NaN', () => {
        expect(normalize(point(0, 0))).toEqual({ x: 0, y: 0 });
    });

    it('measures the angle between two points', () => {
        expect(toDegrees(angleBetween(point(0, 0), point(10, 0)))).toBeCloseTo(0);
        expect(toDegrees(angleBetween(point(0, 0), point(0, 10)))).toBeCloseTo(90);
    });
});

describe('angles', () => {
    it('wraps into a half-open turn', () => {
        expect(normalizeAngle(toRadians(370))).toBeCloseTo(toRadians(10));
        expect(normalizeAngle(toRadians(-190))).toBeCloseTo(toRadians(170));
    });

    it('reports a half turn as positive π, not negative', () => {
        expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    });

    it('snaps to increments, and leaves the angle alone for a non-positive step', () => {
        const step = toRadians(15);

        expect(toDegrees(snapAngle(toRadians(17), step))).toBeCloseTo(15);
        expect(toDegrees(snapAngle(toRadians(23), step))).toBeCloseTo(30);
        expect(snapAngle(1.234, 0)).toBe(1.234);
    });
});

describe('segments', () => {
    const wall = { a: point(0, 0), b: point(1000, 0) };

    it('clamps the closest point to the endpoints', () => {
        expect(closestPointOnSegment(wall, point(500, 400))).toEqual({ x: 500, y: 0 });
        expect(closestPointOnSegment(wall, point(-500, 0))).toEqual({ x: 0, y: 0 });
        expect(closestPointOnSegment(wall, point(9000, 0))).toEqual({ x: 1000, y: 0 });
    });

    it('measures distance to the segment, not to the infinite line', () => {
        expect(distanceToSegment(wall, point(500, 300))).toBeCloseTo(300);
        expect(distanceToSegment(wall, point(1300, 0))).toBeCloseTo(300);
    });

    it('handles a degenerate segment without dividing by zero', () => {
        const dot = { a: point(5, 5), b: point(5, 5) };

        expect(distanceToSegment(dot, point(5, 15))).toBeCloseTo(10);
    });

    it('finds a crossing, including at a shared corner', () => {
        const crossing = intersectSegments(
            { a: point(0, 0), b: point(100, 100) },
            { a: point(0, 100), b: point(100, 0) },
        );

        expect(crossing?.x).toBeCloseTo(50);
        expect(crossing?.y).toBeCloseTo(50);

        expect(
            intersectSegments(
                { a: point(0, 0), b: point(100, 0) },
                { a: point(100, 0), b: point(100, 100) },
            ),
        ).toEqual({ x: 100, y: 0 });
    });

    it('reports no crossing for parallel segments or a miss past the end', () => {
        expect(
            intersectSegments(
                { a: point(0, 0), b: point(100, 0) },
                { a: point(0, 50), b: point(100, 50) },
            ),
        ).toBeNull();

        expect(
            intersectSegments(
                { a: point(0, 0), b: point(10, 0) },
                { a: point(50, -50), b: point(50, 50) },
            ),
        ).toBeNull();
    });
});

describe('polygons', () => {
    // A 6.00 × 4.00 m room, in millimetres.
    const room = [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)];

    it('measures area regardless of winding', () => {
        expect(polygonArea(room)).toBe(24_000_000);
        expect(polygonArea([...room].reverse())).toBe(24_000_000);
    });

    it('finds the centroid of a rectangle at its centre', () => {
        expect(polygonCentroid(room)).toEqual({ x: 3000, y: 2000 });
    });

    it('averages the vertices when the ring is degenerate', () => {
        expect(polygonCentroid([point(0, 0), point(10, 0), point(20, 0)])).toEqual({
            x: 10,
            y: 0,
        });
    });

    it('tests containment', () => {
        expect(pointInPolygon(room, point(3000, 2000))).toBe(true);
        expect(pointInPolygon(room, point(-1, 2000))).toBe(false);
        expect(pointInPolygon(room, point(6001, 2000))).toBe(false);
    });

    it('measures distance to the outline, closed or open', () => {
        expect(distanceToPolyline(room, point(3000, 2000), true)).toBeCloseTo(2000);

        // Closed, the left edge is 500 away. Open, that edge does not exist, so the nearest
        // point is the corner it would have run to — which is what separates a polygon from
        // a polyline for hit-testing.
        expect(distanceToPolyline(room, point(-500, 2000), true)).toBeCloseTo(500);
        expect(distanceToPolyline(room, point(-500, 2000), false)).toBeCloseTo(
            Math.hypot(500, 2000),
        );
    });

    it('measures distance to a single-point ring', () => {
        expect(distanceToPolyline([point(0, 0)], point(0, 30), false)).toBeCloseTo(30);
        expect(distanceToPolyline([], point(0, 0), false)).toBe(Infinity);
    });
});

describe('bounds', () => {
    it('builds from points and returns null for none', () => {
        expect(boundsFromPoints([point(10, 5), point(-2, 30)])).toEqual({
            minX: -2,
            minY: 5,
            maxX: 10,
            maxY: 30,
        });

        expect(boundsFromPoints([])).toBeNull();
    });

    it('separates containment from intersection, which is what window and crossing selection need', () => {
        const marquee = boundsFromCorners(point(0, 0), point(100, 100));
        const inside = boundsFromCorners(point(10, 10), point(20, 20));
        const straddling = boundsFromCorners(point(90, 90), point(200, 200));

        expect(boundsContain(marquee, inside)).toBe(true);
        expect(boundsContain(marquee, straddling)).toBe(false);
        expect(boundsIntersect(marquee, straddling)).toBe(true);
        expect(boundsIntersect(marquee, boundsFromCorners(point(500, 500), point(600, 600)))).toBe(
            false,
        );
    });
});
