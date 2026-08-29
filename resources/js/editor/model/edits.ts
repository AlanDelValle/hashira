import {
    angleBetween,
    add,
    distance,
    point,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';

import type { Element } from './types';

/**
 * Editing an element by value rather than by dragging it.
 *
 * These are the operations behind the properties panel: type 3.42 into the length field and
 * the wall becomes 3.42 m long. Each one is a pure function returning a new element, so the
 * panel stays a thin layer over them and the awkward cases — which end of a wall stays put —
 * are decided here once and tested.
 */

export function setPosition(element: Element, x: number, y: number): Element {
    return { ...element, transform: { ...element.transform, x, y } };
}

export function setRotation(element: Element, rotation: number): Element {
    return { ...element, transform: { ...element.transform, rotation } };
}

export function setLayer(element: Element, layerId: string): Element {
    return { ...element, layerId };
}

/**
 * Change a wall or line's length.
 *
 * The `a` end stays where it is and `b` moves along the existing direction — the same thing
 * that happens when you pull the far end of a tape measure. Both points are then recentred so
 * the element's origin remains its middle, keeping the invariant every factory establishes.
 */
export function setSegmentLength(element: Element, length: number): Element {
    if ((element.type !== 'wall' && element.type !== 'line') || length <= 0) {
        return element;
    }

    const { a, b } = element.geometry;
    const current = distance(a, b);

    if (current === 0) {
        return element;
    }

    const direction = scale(subtract(b, a), 1 / current);
    const movedB = add(a, scale(direction, length));

    return recentre(element, a, movedB);
}

/** Turn a wall or line about its `a` end, in world terms. */
export function setSegmentAngle(element: Element, angle: number): Element {
    if (element.type !== 'wall' && element.type !== 'line') {
        return element;
    }

    const { a, b } = element.geometry;
    const length = distance(a, b);

    if (length === 0) {
        return element;
    }

    // The stored rotation is folded in, so the angle shown and typed is the one on the sheet.
    const local = angle - element.transform.rotation;
    const movedB = add(a, scale(point(Math.cos(local), Math.sin(local)), length));

    return recentre(element, a, movedB);
}

/** The world angle a wall or line reads at, including its transform's rotation. */
export function segmentAngle(element: Element): number | null {
    if (element.type !== 'wall' && element.type !== 'line') {
        return null;
    }

    return angleBetween(element.geometry.a, element.geometry.b) + element.transform.rotation;
}

/**
 * Rewrite a segment's points so the local origin sits at their midpoint again, moving the
 * transform to compensate. Without this an edited wall would keep drifting away from its own
 * anchor and rotations would start pivoting somewhere unexpected.
 */
function recentre(
    element: Extract<Element, { type: 'wall' | 'line' }>,
    a: Point,
    b: Point,
): Element {
    const localCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const rotated = rotatePoint(localCentre, element.transform.rotation);

    const transform = {
        ...element.transform,
        x: element.transform.x + rotated.x,
        y: element.transform.y + rotated.y,
    };

    const geometry = {
        ...element.geometry,
        a: subtract(a, localCentre),
        b: subtract(b, localCentre),
    };

    return element.type === 'wall'
        ? {
              ...element,
              transform,
              geometry: { ...geometry, thickness: element.geometry.thickness },
          }
        : { ...element, transform, geometry };
}

function rotatePoint(p: Point, radians: number): Point {
    if (radians === 0) {
        return p;
    }

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function setWallThickness(element: Element, thickness: number): Element {
    return element.type === 'wall' && thickness > 0
        ? { ...element, geometry: { ...element.geometry, thickness } }
        : element;
}

export function setRectSize(element: Element, width: number, height: number): Element {
    return element.type === 'rect' && width > 0 && height > 0
        ? { ...element, geometry: { width, height } }
        : element;
}

export function setCircleRadius(element: Element, radius: number): Element {
    return element.type === 'circle' && radius > 0 ? { ...element, geometry: { radius } } : element;
}

export function setAssetSize(element: Element, width: number, height: number): Element {
    return element.type === 'asset' && width > 0 && height > 0
        ? { ...element, geometry: { ...element.geometry, width, height } }
        : element;
}

export function setAssetMirrored(element: Element, mirrored: boolean): Element {
    return element.type === 'asset'
        ? { ...element, geometry: { ...element.geometry, mirrored } }
        : element;
}

export function setOpeningWidth(element: Element, width: number): Element {
    if (width <= 0) {
        return element;
    }

    if (element.type === 'door') {
        return { ...element, geometry: { ...element.geometry, width } };
    }

    if (element.type === 'window') {
        return { ...element, geometry: { ...element.geometry, width } };
    }

    return element;
}

export function setOpeningOffset(element: Element, offset: number): Element {
    if (element.type === 'door') {
        return { ...element, geometry: { ...element.geometry, offset } };
    }

    if (element.type === 'window') {
        return { ...element, geometry: { ...element.geometry, offset } };
    }

    return element;
}

export function setDoorSwing(element: Element, swing: 'left' | 'right'): Element {
    return element.type === 'door'
        ? { ...element, geometry: { ...element.geometry, swing } }
        : element;
}

export function setDoorFlipped(element: Element, flipped: boolean): Element {
    return element.type === 'door'
        ? { ...element, geometry: { ...element.geometry, flipped } }
        : element;
}

export function setTextContent(element: Element, content: string): Element {
    return element.type === 'text'
        ? { ...element, geometry: { ...element.geometry, content } }
        : element;
}

export function setTextSize(element: Element, fontSize: number): Element {
    return element.type === 'text' && fontSize > 0
        ? { ...element, geometry: { ...element.geometry, fontSize } }
        : element;
}
