import { boundsCentre, boundsFromPoints } from '@/editor/geometry/bbox';
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
    if (element.type === 'leader') {
        const trimmed = content.trim();

        return trimmed === ''
            ? element
            : { ...element, geometry: { ...element.geometry, content: trimmed } };
    }

    return element.type === 'text'
        ? { ...element, geometry: { ...element.geometry, content } }
        : element;
}

export function setTextSize(element: Element, fontSize: number): Element {
    if (fontSize <= 0) {
        return element;
    }

    if (element.type === 'leader') {
        return { ...element, geometry: { ...element.geometry, fontSize } };
    }

    return element.type === 'text'
        ? { ...element, geometry: { ...element.geometry, fontSize } }
        : element;
}

/**
 * Which side of the measurement its line sits on, and how far out. Signed, so dragging it
 * through zero moves it to the other side rather than stopping at the geometry.
 *
 * There is deliberately no setter for a dimension's *value*. A measurement is read off the
 * two points it spans; letting anyone type over it would produce a drawing that states one
 * length and shows another, which is the one thing a measured drawing must never do.
 */
/**
 * Re-point a measurement, keeping its local origin at the centre of what it now measures — so
 * carrying a chain on to one more point does not leave the mark rotating about where it used
 * to end.
 */
export function setDimensionPoints(element: Element, points: readonly Point[]): Element {
    if (element.type !== 'dimension' || points.length < 2) {
        return element;
    }

    const bounds = boundsFromPoints(points);
    const centre = bounds === null ? (points[0] ?? { x: 0, y: 0 }) : boundsCentre(bounds);

    return {
        ...element,
        transform: { ...element.transform, x: centre.x, y: centre.y },
        geometry: { ...element.geometry, points: points.map((p) => subtract(p, centre)) },
    };
}

export function setDimensionOffset(element: Element, offset: number): Element {
    return element.type === 'dimension'
        ? { ...element, geometry: { ...element.geometry, offset } }
        : element;
}

export function setDimensionSize(element: Element, fontSize: number): Element {
    if (fontSize <= 0) {
        return element;
    }

    // Rebuilt per type rather than once over the union: spreading a shared geometry would
    // leave `geometry` a mixture of both shapes, which is neither element's own.
    if (element.type === 'dimension') {
        return { ...element, geometry: { ...element.geometry, fontSize } };
    }

    return element.type === 'angle'
        ? { ...element, geometry: { ...element.geometry, fontSize } }
        : element;
}

/** How far out from the corner an angle's arc is struck. */
export function setAngleRadius(element: Element, radius: number): Element {
    return element.type === 'angle' && radius > 0
        ? { ...element, geometry: { ...element.geometry, radius } }
        : element;
}

/** Which way a radius points out of its circle. */
export function setRadiusAngle(element: Element, angle: number): Element {
    return element.type === 'radius'
        ? { ...element, geometry: { ...element.geometry, angle } }
        : element;
}

/**
 * Whether a radius measures the radius or the diameter. It is the same line drawn twice as
 * long, and the value it writes says which of the two it means.
 */
export function setRadiusDiameter(element: Element, diameter: boolean): Element {
    return element.type === 'radius'
        ? { ...element, geometry: { ...element.geometry, diameter } }
        : element;
}
