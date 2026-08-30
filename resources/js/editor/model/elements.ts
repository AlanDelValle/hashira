import { normalizeAngle } from '@/editor/geometry/angle';
import { boundsFromPoints, expandBounds, type Bounds } from '@/editor/geometry/bbox';
import { distanceToPolyline, pointInPolygon } from '@/editor/geometry/polygon';
import { distanceToSegment, type Segment } from '@/editor/geometry/segment';
import {
    add,
    clamp,
    distance,
    dot,
    midpoint,
    negate,
    normalize,
    perpendicular,
    rotate,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';

import type {
    DimensionElement,
    DoorElement,
    Element,
    HashiraDocument,
    Transform,
    WallElement,
} from './types';

/**
 * Where every element actually is.
 *
 * `transform` maps an element's local geometry into the world: rotate about the local origin,
 * then translate. Elements are created with their local origin at their own centre, so the
 * rotation a handle applies is the rotation a user expects. Hosted openings are the exception
 * — a door has no independent position, only a distance along the wall it belongs to — so
 * everything here takes a lookup to resolve a host.
 */

export type ElementLookup = (id: string) => Element | undefined;

/** Rough advance width per character as a fraction of font size, for text hit-testing. */
const TEXT_WIDTH_RATIO = 0.55;

export function makeLookup(elements: readonly Element[]): ElementLookup {
    const index = new Map(elements.map((element) => [element.id, element]));

    return (id) => index.get(id);
}

export function localToWorld(transform: Transform, p: Point): Point {
    return add(rotate(p, transform.rotation), { x: transform.x, y: transform.y });
}

export function worldToLocal(transform: Transform, p: Point): Point {
    return rotate(subtract(p, { x: transform.x, y: transform.y }), -transform.rotation);
}

/** The world position of a wall's two ends. */
export function wallSegment(wall: WallElement): Segment {
    return {
        a: localToWorld(wall.transform, wall.geometry.a),
        b: localToWorld(wall.transform, wall.geometry.b),
    };
}

export interface HostedFrame {
    host: WallElement;
    /** Centre of the opening, in world space. */
    centre: Point;
    /** Unit vector along the wall, from its `a` end towards its `b` end. */
    direction: Point;
    hostLength: number;
    halfWidth: number;
    thickness: number;
}

export function hostedFrame(element: Element, lookup: ElementLookup): HostedFrame | null {
    if (element.type !== 'door' && element.type !== 'window') {
        return null;
    }

    const host = lookup(element.geometry.hostId);

    if (host === undefined || host.type !== 'wall') {
        return null;
    }

    const segment = wallSegment(host);
    const hostLength = distance(segment.a, segment.b);

    if (hostLength === 0) {
        return null;
    }

    const direction = normalize(subtract(segment.b, segment.a));
    const offset = clamp(element.geometry.offset, 0, hostLength);

    return {
        host,
        centre: add(segment.a, scale(direction, offset)),
        direction,
        hostLength,
        halfWidth: element.geometry.width / 2,
        thickness: host.geometry.thickness,
    };
}

export interface DoorSwing {
    hinge: Point;
    /** Unit vector the leaf points along when the door is fully open. */
    openDirection: Point;
    /** Unit vector from the hinge towards the opposite jamb. */
    towardsOtherJamb: Point;
    radius: number;
}

/**
 * Where a door's leaf and its arc go. Shared by the painter and by the bounds, so the swing
 * that is drawn is the swing that gets framed by a zoom to fit.
 */
export function doorSwing(door: DoorElement, frame: HostedFrame): DoorSwing {
    const width = frame.halfWidth * 2;
    const along = scale(frame.direction, frame.halfWidth);

    return {
        hinge:
            door.geometry.swing === 'left'
                ? subtract(frame.centre, along)
                : add(frame.centre, along),
        openDirection: scale(perpendicular(frame.direction), door.geometry.flipped ? -1 : 1),
        towardsOtherJamb:
            door.geometry.swing === 'left' ? frame.direction : negate(frame.direction),
        radius: width,
    };
}

/** The four corners of a hosted opening, in world space. */
function hostedCorners(frame: HostedFrame): Point[] {
    const along = scale(frame.direction, frame.halfWidth);
    const across = scale(perpendicular(frame.direction), frame.thickness / 2);

    return [
        add(add(frame.centre, along), across),
        add(subtract(frame.centre, along), across),
        subtract(subtract(frame.centre, along), across),
        subtract(add(frame.centre, along), across),
    ];
}

/**
 * The world points that define an element's shape: endpoints for a wall or line, corners for
 * a rectangle, vertices for a polygon. Circles have none — they are handled directly by the
 * callers that need them — and an unresolved opening returns an empty list.
 */
export function elementWorldPoints(element: Element, lookup: ElementLookup): Point[] {
    switch (element.type) {
        case 'wall':
        case 'line':
            return [
                localToWorld(element.transform, element.geometry.a),
                localToWorld(element.transform, element.geometry.b),
            ];

        case 'rect':
        case 'asset': {
            const halfWidth = element.geometry.width / 2;
            const halfHeight = element.geometry.height / 2;

            return [
                { x: -halfWidth, y: -halfHeight },
                { x: halfWidth, y: -halfHeight },
                { x: halfWidth, y: halfHeight },
                { x: -halfWidth, y: halfHeight },
            ].map((corner) => localToWorld(element.transform, corner));
        }

        case 'polygon':
        case 'room':
            return element.geometry.points.map((p) => localToWorld(element.transform, p));

        case 'dimension':
            return [
                localToWorld(element.transform, element.geometry.a),
                localToWorld(element.transform, element.geometry.b),
            ];

        case 'door':
        case 'window': {
            const frame = hostedFrame(element, lookup);

            return frame === null ? [] : hostedCorners(frame);
        }

        case 'circle':
        case 'text':
            return [];
    }
}

export interface DimensionFrame {
    /** The two points being measured, in world space. */
    from: Point;
    to: Point;
    /** The ends of the dimension line itself, offset perpendicular from the measured points. */
    lineFrom: Point;
    lineTo: Point;
    /** Unit vector along the measurement, and the unit perpendicular the offset runs along. */
    direction: Point;
    normal: Point;
    /** What is being measured, in millimetres. Derived, never stored. */
    length: number;
    /** Baseline of the value, and the angle it is written at — never upside down. */
    textAt: Point;
    textRotation: number;
    /** Half an end tick, and the gap left before an extension line starts. */
    tick: number;
    gap: number;
}

/**
 * Everything a dimension is drawn from, worked out once.
 *
 * The renderer, the exporters, the bounding box and the hit test all read this, so a
 * dimension cannot be drawn in one place and measured in another — the same mistake
 * `doorSwing` exists to prevent for a door.
 */
export function dimensionFrame(element: DimensionElement): DimensionFrame | null {
    const from = localToWorld(element.transform, element.geometry.a);
    const to = localToWorld(element.transform, element.geometry.b);
    const length = distance(from, to);

    if (length === 0) {
        return null;
    }

    const { offset, fontSize } = element.geometry;
    const direction = normalize(subtract(to, from));
    const normal = perpendicular(direction);
    const along = scale(normal, offset);

    // Written along the measurement, but flipped when that would leave it upside down. A
    // drawing is read from one side, and a number the reader has to rotate the sheet for is
    // a number they will misread.
    const angle = Math.atan2(direction.y, direction.x);
    const upright = Math.abs(angle) > Math.PI / 2;
    const reading = upright ? negate(direction) : direction;

    // Canvas y grows downwards, so "up" from the reader's point of view is the perpendicular
    // negated. Text sits on its baseline, so this only has to clear the line itself.
    const up = negate(perpendicular(reading));

    return {
        from,
        to,
        lineFrom: add(from, along),
        lineTo: add(to, along),
        direction,
        normal,
        length,
        textAt: add(add(midpoint(from, to), along), scale(up, fontSize * 0.3)),
        textRotation: upright ? normalizeAngle(angle + Math.PI) : angle,
        tick: fontSize * 0.45,
        gap: fontSize * 0.3,
    };
}

/**
 * The polylines a dimension is drawn as: an extension line out from each measured point, the
 * dimension line between them, and an oblique tick at each end in place of an arrowhead —
 * which is how a measured drawing has been ticked off since long before there were plotters.
 */
export function dimensionStrokes(frame: DimensionFrame): [Point, Point][] {
    const strokes: [Point, Point][] = [[frame.lineFrom, frame.lineTo]];

    const reach = subtract(frame.lineFrom, frame.from);
    const distanceOut = Math.hypot(reach.x, reach.y);

    // A dimension line sitting on the measured points has nothing to extend from.
    if (distanceOut > frame.gap) {
        const outwards = normalize(reach);
        const start = scale(outwards, frame.gap);
        const end = scale(outwards, distanceOut + frame.tick);

        strokes.push([add(frame.from, start), add(frame.from, end)]);
        strokes.push([add(frame.to, start), add(frame.to, end)]);
    }

    const oblique = scale(normalize(add(frame.direction, frame.normal)), frame.tick);

    for (const at of [frame.lineFrom, frame.lineTo]) {
        strokes.push([subtract(at, oblique), add(at, oblique)]);
    }

    return strokes;
}

export function elementAnchor(element: Element, lookup: ElementLookup): Point {
    const frame = hostedFrame(element, lookup);

    return frame?.centre ?? { x: element.transform.x, y: element.transform.y };
}

/** Approximate, because measuring text needs a canvas the model deliberately does not have. */
function textBounds(element: Element & { type: 'text' }): Bounds {
    const { content, fontSize, align } = element.geometry;
    const width = Math.max(content.length, 1) * fontSize * TEXT_WIDTH_RATIO;
    const anchor = { x: element.transform.x, y: element.transform.y };

    const left =
        align === 'center' ? anchor.x - width / 2 : align === 'right' ? anchor.x - width : anchor.x;

    return {
        minX: left,
        maxX: left + width,
        minY: anchor.y - fontSize * 0.8,
        maxY: anchor.y + fontSize * 0.25,
    };
}

export function elementBounds(element: Element, lookup: ElementLookup): Bounds | null {
    switch (element.type) {
        case 'circle': {
            const { x, y } = element.transform;
            const r = element.geometry.radius;

            return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
        }

        case 'text':
            return textBounds(element);

        case 'door': {
            const frame = hostedFrame(element, lookup);
            const corners = elementWorldPoints(element, lookup);

            if (frame === null) {
                return boundsFromPoints(corners);
            }

            // The leaf and its arc are ink on the sheet, so they belong in the extent a zoom
            // to fit has to cover.
            const swing = doorSwing(element, frame);

            return boundsFromPoints([
                ...corners,
                add(swing.hinge, scale(swing.openDirection, swing.radius)),
                add(swing.hinge, scale(swing.towardsOtherJamb, swing.radius)),
            ]);
        }

        case 'wall': {
            const points = elementWorldPoints(element, lookup);
            const bounds = boundsFromPoints(points);

            // A wall is a band, not a line: its poché reaches half a thickness either side.
            return bounds === null ? null : expandBounds(bounds, element.geometry.thickness / 2);
        }

        case 'dimension': {
            const frame = dimensionFrame(element);

            if (frame === null) {
                return boundsFromPoints(elementWorldPoints(element, lookup));
            }

            // The dimension line and its value are ink on the sheet and sit away from what is
            // being measured, so a zoom to fit that framed only the measured points would cut
            // the measurement off.
            const bounds = boundsFromPoints([...dimensionStrokes(frame).flat(), frame.textAt]);

            return bounds === null ? null : expandBounds(bounds, element.geometry.fontSize);
        }

        default:
            return boundsFromPoints(elementWorldPoints(element, lookup));
    }
}

export function documentBounds(document: HashiraDocument): Bounds | null {
    const lookup = makeLookup(document.elements);
    let result: Bounds | null = null;

    for (const element of document.elements) {
        const bounds = elementBounds(element, lookup);

        if (bounds === null) continue;

        result =
            result === null
                ? bounds
                : {
                      minX: Math.min(result.minX, bounds.minX),
                      minY: Math.min(result.minY, bounds.minY),
                      maxX: Math.max(result.maxX, bounds.maxX),
                      maxY: Math.max(result.maxY, bounds.maxY),
                  };
    }

    return result;
}

/**
 * Hit-testing is on the outline, at a tolerance the caller has already converted from screen
 * pixels into world millimetres — so picking feels the same at every zoom level.
 *
 * Closed *areas* (rooms) also accept a hit anywhere inside them, because a room is a space
 * rather than a boundary. Rectangles, circles and polygons do not: in a drawing full of
 * overlapping shapes, an outline-only pick is what lets you reach the one underneath.
 */
export function hitTestElement(
    element: Element,
    lookup: ElementLookup,
    p: Point,
    tolerance: number,
): boolean {
    switch (element.type) {
        case 'wall': {
            const [a, b] = elementWorldPoints(element, lookup);

            if (a === undefined || b === undefined) return false;

            return distanceToSegment({ a, b }, p) <= element.geometry.thickness / 2 + tolerance;
        }

        case 'line': {
            const [a, b] = elementWorldPoints(element, lookup);

            if (a === undefined || b === undefined) return false;

            return distanceToSegment({ a, b }, p) <= tolerance;
        }

        case 'circle': {
            const centre = { x: element.transform.x, y: element.transform.y };

            return Math.abs(distance(centre, p) - element.geometry.radius) <= tolerance;
        }

        case 'rect':
            return distanceToPolyline(elementWorldPoints(element, lookup), p, true) <= tolerance;

        case 'asset': {
            // A block is an object, not construction geometry: clicking a sofa should select
            // the sofa, so its whole footprint is a target and not only its outline.
            const points = elementWorldPoints(element, lookup);

            return pointInPolygon(points, p) || distanceToPolyline(points, p, true) <= tolerance;
        }

        case 'polygon':
            return (
                distanceToPolyline(
                    elementWorldPoints(element, lookup),
                    p,
                    element.geometry.closed,
                ) <= tolerance
            );

        case 'room': {
            const points = elementWorldPoints(element, lookup);

            return distanceToPolyline(points, p, true) <= tolerance || pointInPolygon(points, p);
        }

        case 'door':
        case 'window': {
            const points = elementWorldPoints(element, lookup);

            return (
                points.length > 0 &&
                (pointInPolygon(points, p) || distanceToPolyline(points, p, true) <= tolerance)
            );
        }

        case 'text': {
            const bounds = textBounds(element);

            return (
                p.x >= bounds.minX - tolerance &&
                p.x <= bounds.maxX + tolerance &&
                p.y >= bounds.minY - tolerance &&
                p.y <= bounds.maxY + tolerance
            );
        }

        case 'dimension': {
            const frame = dimensionFrame(element);

            if (frame === null) return false;

            // Every line it draws is a line you can grab, including the ticks — the whole
            // mark is one object and picking should agree with what it looks like.
            return dimensionStrokes(frame).some(
                ([a, b]) => distanceToSegment({ a, b }, p) <= tolerance,
            );
        }
    }
}

/**
 * Move an element by a world delta.
 *
 * A hosted opening cannot go anywhere its wall does not: the delta is projected onto the wall
 * and applied as a change of offset, clamped so the opening stays within the wall it cuts.
 */
export function translateElement(element: Element, delta: Point, lookup: ElementLookup): Element {
    if (element.type === 'door' || element.type === 'window') {
        const frame = hostedFrame(element, lookup);

        if (frame === null) {
            return element;
        }

        const along = dot(delta, frame.direction);
        const offset = clamp(
            element.geometry.offset + along,
            frame.halfWidth,
            Math.max(frame.halfWidth, frame.hostLength - frame.halfWidth),
        );

        // Rebuilt per type: narrowing the two together would leave `geometry` a union of
        // both shapes, which is neither element's own.
        return element.type === 'door'
            ? { ...element, geometry: { ...element.geometry, offset } }
            : { ...element, geometry: { ...element.geometry, offset } };
    }

    return {
        ...element,
        transform: {
            ...element.transform,
            x: element.transform.x + delta.x,
            y: element.transform.y + delta.y,
        },
    };
}

/** Rotate about a world pivot. Hosted openings follow their wall, so they are left alone. */
export function rotateElement(
    element: Element,
    pivot: Point,
    radians: number,
    _lookup: ElementLookup,
): Element {
    if (element.type === 'door' || element.type === 'window') {
        return element;
    }

    const anchor = { x: element.transform.x, y: element.transform.y };
    const moved = add(rotate(subtract(anchor, pivot), radians), pivot);

    return {
        ...element,
        transform: {
            x: moved.x,
            y: moved.y,
            rotation: element.transform.rotation + radians,
        },
    };
}

/**
 * An element's own size, where it has one.
 *
 * Deliberately not the bounding box: a rotated rectangle is still the rectangle it was drawn
 * as, and reporting the box around it as its width and height would be telling the user their
 * shape changed size when it only turned.
 */
export function elementSize(element: Element): { width: number; height: number } | null {
    switch (element.type) {
        case 'rect':
        case 'asset':
            return { width: element.geometry.width, height: element.geometry.height };
        case 'circle':
            return { width: element.geometry.radius * 2, height: element.geometry.radius * 2 };
        default:
            return null;
    }
}

/** The length a wall or line measures, in millimetres. */
export function elementLength(element: Element): number | null {
    if (element.type !== 'wall' && element.type !== 'line') {
        return null;
    }

    return distance(element.geometry.a, element.geometry.b);
}
