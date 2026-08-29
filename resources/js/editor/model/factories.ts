import { boundsCentre, boundsFromPoints } from '@/editor/geometry/bbox';
import { midpoint, subtract, type Point } from '@/editor/geometry/vec';

import { newId } from './id';
import type { CircleElement, LineElement, PolygonElement, RectElement, WallElement } from './types';

/**
 * Making new elements.
 *
 * Every factory places the element's local origin at its own centre and puts that centre in
 * the transform. That is what makes a later rotation pivot where a user expects, and it keeps
 * a move a two-number change rather than a rewrite of every vertex.
 */

export const DEFAULT_WALL_THICKNESS = 150;

function metadata() {
    return { createdAt: new Date().toISOString() };
}

export function createLine(a: Point, b: Point, layerId: string): LineElement {
    const centre = midpoint(a, b);

    return {
        id: newId(),
        type: 'line',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { a: subtract(a, centre), b: subtract(b, centre) },
        metadata: metadata(),
    };
}

export function createWall(
    a: Point,
    b: Point,
    layerId: string,
    thickness = DEFAULT_WALL_THICKNESS,
): WallElement {
    const centre = midpoint(a, b);

    return {
        id: newId(),
        type: 'wall',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { a: subtract(a, centre), b: subtract(b, centre), thickness },
        metadata: metadata(),
    };
}

/** Built from two opposite corners, the way a drag defines a rectangle. */
export function createRect(cornerA: Point, cornerB: Point, layerId: string): RectElement {
    const centre = midpoint(cornerA, cornerB);

    return {
        id: newId(),
        type: 'rect',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: {
            width: Math.abs(cornerB.x - cornerA.x),
            height: Math.abs(cornerB.y - cornerA.y),
        },
        metadata: metadata(),
    };
}

export function createCircle(centre: Point, radius: number, layerId: string): CircleElement {
    return {
        id: newId(),
        type: 'circle',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { radius },
        metadata: metadata(),
    };
}

export function createPolygon(
    points: readonly Point[],
    closed: boolean,
    layerId: string,
): PolygonElement | null {
    const bounds = boundsFromPoints(points);

    if (bounds === null || points.length < 2) {
        return null;
    }

    const centre = boundsCentre(bounds);

    return {
        id: newId(),
        type: 'polygon',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { points: points.map((p) => subtract(p, centre)), closed },
        metadata: metadata(),
    };
}
