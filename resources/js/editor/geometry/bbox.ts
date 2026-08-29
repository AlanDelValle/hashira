import type { Point } from './vec';

/** An axis-aligned bounding box in world millimetres. */
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function boundsFromPoints(points: readonly Point[]): Bounds | null {
    const first = points[0];

    if (first === undefined) {
        return null;
    }

    let { x: minX, y: minY } = first;
    let maxX = minX;
    let maxY = minY;

    for (let i = 1; i < points.length; i++) {
        const p = points[i];

        if (p === undefined) continue;

        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
    if (a === null) return b === null ? null : { ...b };
    if (b === null) return { ...a };

    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
    };
}

export function expandBounds(bounds: Bounds, by: number): Bounds {
    return {
        minX: bounds.minX - by,
        minY: bounds.minY - by,
        maxX: bounds.maxX + by,
        maxY: bounds.maxY + by,
    };
}

export function boundsWidth(bounds: Bounds): number {
    return bounds.maxX - bounds.minX;
}

export function boundsHeight(bounds: Bounds): number {
    return bounds.maxY - bounds.minY;
}

export function boundsCentre(bounds: Bounds): Point {
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function boundsCorners(bounds: Bounds): [Point, Point, Point, Point] {
    return [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
    ];
}

export function boundsContainPoint(bounds: Bounds, p: Point): boolean {
    return p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
}

/** True when `inner` sits entirely inside `outer` — the test a window selection uses. */
export function boundsContain(outer: Bounds, inner: Bounds): boolean {
    return (
        inner.minX >= outer.minX &&
        inner.maxX <= outer.maxX &&
        inner.minY >= outer.minY &&
        inner.maxY <= outer.maxY
    );
}

/** True when the two overlap at all — the test a crossing selection uses. */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boundsFromCorners(a: Point, b: Point): Bounds {
    return {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
    };
}
