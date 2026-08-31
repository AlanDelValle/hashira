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
    AngleElement,
    DimensionElement,
    DoorElement,
    Element,
    HashiraDocument,
    LeaderElement,
    RadiusElement,
    TextAlign,
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
        case 'dimension':
        case 'leader':
            return element.geometry.points.map((p) => localToWorld(element.transform, p));

        case 'angle':
            return [element.geometry.vertex, element.geometry.from, element.geometry.to].map((p) =>
                localToWorld(element.transform, p),
            );

        case 'door':
        case 'window': {
            const frame = hostedFrame(element, lookup);

            return frame === null ? [] : hostedCorners(frame);
        }

        case 'radius': {
            const frame = radiusFrame(element, lookup);

            return frame === null ? [] : [frame.at, frame.opposite];
        }

        case 'circle':
        case 'text':
            return [];
    }
}

/** One measurement of a chain: a pair of neighbouring points, and the value between them. */
export interface DimensionSegment {
    /** Where this measurement's own piece of the dimension line runs between. */
    lineFrom: Point;
    lineTo: Point;
    /** What it measures, along the run's direction, in millimetres. Derived, never stored. */
    length: number;
    /** Baseline of the value, and the angle it is written at — never upside down. */
    textAt: Point;
    textRotation: number;
}

export interface DimensionFrame {
    /** The points being measured, in world space: two for one measurement, more for a chain. */
    points: Point[];
    /** The first and the last of them, kept apart because almost everything wants those two. */
    from: Point;
    to: Point;
    /** The ends of the dimension line itself, offset perpendicular from the measured points. */
    lineFrom: Point;
    lineTo: Point;
    /** Unit vector along the run, and the unit perpendicular the offset goes out along. */
    direction: Point;
    normal: Point;
    /** The whole run, end to end. What each part of it measures is on the segments. */
    length: number;
    segments: DimensionSegment[];
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
    const points = element.geometry.points.map((p) => localToWorld(element.transform, p));
    const from = points[0];
    const to = points[points.length - 1];

    if (from === undefined || to === undefined) {
        return null;
    }

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
    const textRotation = upright ? normalizeAngle(angle + Math.PI) : angle;

    /** Where a measured point sits on the dimension line. */
    const onLine = (p: Point): Point =>
        add(add(from, scale(direction, dot(subtract(p, from), direction))), along);

    const ticks = points.map(onLine);
    const segments: DimensionSegment[] = [];

    for (let i = 0; i + 1 < ticks.length; i++) {
        const lineFrom = ticks[i];
        const lineTo = ticks[i + 1];

        if (lineFrom === undefined || lineTo === undefined) continue;

        segments.push({
            lineFrom,
            lineTo,
            length: distance(lineFrom, lineTo),
            textAt: add(midpoint(lineFrom, lineTo), scale(up, fontSize * 0.3)),
            textRotation,
        });
    }

    return {
        points,
        from,
        to,
        lineFrom: add(from, along),
        lineTo: add(to, along),
        direction,
        normal,
        length,
        segments,
        tick: fontSize * 0.45,
        gap: fontSize * 0.3,
    };
}

/**
 * The polylines a dimension is drawn as: an extension line out from each measured point, one
 * dimension line along the whole run, and an oblique tick wherever a measurement begins or
 * ends — which is how a measured drawing has been ticked off since long before there were
 * plotters.
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

        for (const at of frame.points) {
            strokes.push([add(at, start), add(at, end)]);
        }
    }

    const oblique = scale(normalize(add(frame.direction, frame.normal)), frame.tick);
    const ticks = [frame.lineFrom, ...frame.segments.map((segment) => segment.lineTo)];

    for (const at of ticks) {
        strokes.push([subtract(at, oblique), add(at, oblique)]);
    }

    return strokes;
}

/** Everything an angle is drawn from: its two legs, the arc between them, and its value. */
export interface AngleFrame {
    vertex: Point;
    /** Unit vectors along the two legs, and how far along each the leg is drawn. */
    fromDirection: Point;
    toDirection: Point;
    legLength: number;
    radius: number;
    /** The arc, from `start` sweeping by `sweep`; always the lesser of the two angles. */
    start: number;
    sweep: number;
    /** What is being measured, in radians. Derived, never stored. */
    angle: number;
    textAt: Point;
}

/**
 * Where an angle's arc and value go.
 *
 * The measured angle is the lesser of the two the corner offers: the reflex angle is not what
 * anybody means by the corner between two walls, and drawing it would put the arc on the far
 * side of the drawing from the corner it belongs to.
 */
export function angleFrame(element: AngleElement): AngleFrame | null {
    const vertex = localToWorld(element.transform, element.geometry.vertex);
    const first = subtract(localToWorld(element.transform, element.geometry.from), vertex);
    const second = subtract(localToWorld(element.transform, element.geometry.to), vertex);
    const lengths = [Math.hypot(first.x, first.y), Math.hypot(second.x, second.y)];

    if (lengths.some((value) => value === 0)) {
        return null;
    }

    const start = Math.atan2(first.y, first.x);
    const sweep = normalizeAngle(Math.atan2(second.y, second.x) - start);

    if (sweep === 0) {
        return null;
    }

    const middle = start + sweep / 2;
    const { radius, fontSize } = element.geometry;

    return {
        vertex,
        fromDirection: normalize(first),
        toDirection: normalize(second),
        legLength: Math.max(radius * 1.15, Math.min(...lengths)),
        radius,
        start,
        sweep,
        angle: Math.abs(sweep),
        // Just outside the arc, on the line that bisects the corner: the one place the value
        // belongs to both legs equally.
        textAt: add(vertex, scale({ x: Math.cos(middle), y: Math.sin(middle) }, radius + fontSize)),
    };
}

/** The two legs of an angle, drawn from the corner out past the arc. */
export function angleStrokes(frame: AngleFrame): [Point, Point][] {
    return [frame.fromDirection, frame.toDirection].map((direction): [Point, Point] => [
        frame.vertex,
        add(frame.vertex, scale(direction, frame.legLength)),
    ]);
}

/** Whether a direction from the corner falls inside the arc rather than outside it. */
export function withinSweep(frame: AngleFrame, angle: number): boolean {
    const turned = normalizeAngle(angle - frame.start);

    return frame.sweep >= 0
        ? turned >= 0 && turned <= frame.sweep
        : turned <= 0 && turned >= frame.sweep;
}

/** Everything a radius or a diameter is drawn from, read off the circle it is hosted on. */
export interface RadiusFrame {
    centre: Point;
    /** The two ends of the leader: on the circle, and across it when it is a diameter. */
    at: Point;
    opposite: Point;
    /** Where the value is written, and the angle it is written at. */
    textAt: Point;
    textRotation: number;
    /** What is measured, in millimetres: the radius, or twice it. Derived, never stored. */
    measured: number;
    radius: number;
    diameter: boolean;
}

export function radiusFrame(element: RadiusElement, lookup: ElementLookup): RadiusFrame | null {
    const host = lookup(element.geometry.hostId);

    if (host === undefined || host.type !== 'circle') {
        return null;
    }

    const centre = { x: host.transform.x, y: host.transform.y };
    const radius = host.geometry.radius;
    const { angle, diameter, fontSize } = element.geometry;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const at = add(centre, scale(direction, radius));

    const upright = Math.abs(normalizeAngle(angle)) > Math.PI / 2;
    const reading = upright ? negate(direction) : direction;

    return {
        centre,
        at,
        opposite: diameter ? subtract(centre, scale(direction, radius)) : centre,
        textAt: add(
            add(centre, scale(direction, radius * (diameter ? 0 : 0.5))),
            scale(negate(perpendicular(reading)), fontSize * 0.3),
        ),
        textRotation: upright ? normalizeAngle(angle + Math.PI) : normalizeAngle(angle),
        measured: diameter ? radius * 2 : radius,
        radius,
        diameter,
    };
}

/** Everything a leader is drawn from: the bent line, its arrowhead, and where the note sits. */
export interface LeaderFrame {
    points: Point[];
    /** The point being annotated, and the two barbs of the arrowhead there. */
    tip: Point;
    barbs: [Point, Point];
    /** The shelf the note sits on, and where its baseline starts. */
    shelfFrom: Point;
    shelfTo: Point;
    textAt: Point;
    align: TextAlign;
}

/** An arrowhead's length, as a fraction of the note's cap height. */
const ARROW = 0.5;

export function leaderFrame(element: LeaderElement): LeaderFrame | null {
    const points = element.geometry.points.map((p) => localToWorld(element.transform, p));
    const tip = points[0];
    const second = points[1];
    const end = points[points.length - 1];
    const before = points[points.length - 2];

    if (tip === undefined || second === undefined || end === undefined || before === undefined) {
        return null;
    }

    if (distance(tip, second) === 0) {
        return null;
    }

    const { fontSize } = element.geometry;
    const back = normalize(subtract(second, tip));
    const barb = scale(back, fontSize * ARROW);
    const spread = scale(perpendicular(back), fontSize * ARROW * 0.3);

    // The shelf runs on the way the last leg was going, and the note is written away from the
    // bend, so that the words never sit back over the line that led to them.
    const forward = distance(before, end) === 0 ? back : normalize(subtract(end, before));
    const rightwards = forward.x >= 0;
    const shelf = { x: rightwards ? fontSize * 0.6 : -fontSize * 0.6, y: 0 };

    return {
        points,
        tip,
        barbs: [add(add(tip, barb), spread), subtract(add(tip, barb), spread)],
        shelfFrom: end,
        shelfTo: add(end, shelf),
        textAt: add(add(end, shelf), { x: 0, y: -fontSize * 0.3 }),
        align: rightwards ? 'left' : 'right',
    };
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

            // The dimension line and its values are ink on the sheet and sit away from what is
            // being measured, so a zoom to fit that framed only the measured points would cut
            // the measurement off.
            const bounds = boundsFromPoints([
                ...dimensionStrokes(frame).flat(),
                ...frame.segments.map((segment) => segment.textAt),
            ]);

            return bounds === null ? null : expandBounds(bounds, element.geometry.fontSize);
        }

        case 'angle': {
            const frame = angleFrame(element);

            if (frame === null) {
                return boundsFromPoints(elementWorldPoints(element, lookup));
            }

            // The arc bulges past its legs and the value sits outside it, so the extent is
            // the whole circle the arc is struck on, plus room for the words.
            const bounds = boundsFromPoints([
                ...angleStrokes(frame).flat(),
                { x: frame.vertex.x - frame.radius, y: frame.vertex.y - frame.radius },
                { x: frame.vertex.x + frame.radius, y: frame.vertex.y + frame.radius },
                frame.textAt,
            ]);

            return bounds === null ? null : expandBounds(bounds, element.geometry.fontSize);
        }

        case 'radius': {
            const frame = radiusFrame(element, lookup);

            if (frame === null) {
                return null;
            }

            const bounds = boundsFromPoints([frame.at, frame.opposite, frame.centre, frame.textAt]);

            return bounds === null ? null : expandBounds(bounds, element.geometry.fontSize);
        }

        case 'leader': {
            const frame = leaderFrame(element);

            if (frame === null) {
                return boundsFromPoints(elementWorldPoints(element, lookup));
            }

            // The note runs on from the end of the shelf, in whichever direction it is set.
            const width =
                Math.max(element.geometry.content.length, 1) *
                element.geometry.fontSize *
                TEXT_WIDTH_RATIO;

            const bounds = boundsFromPoints([
                ...frame.points,
                frame.shelfTo,
                frame.textAt,
                add(frame.textAt, { x: frame.align === 'right' ? -width : width, y: 0 }),
            ]);

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

        case 'angle': {
            const frame = angleFrame(element);

            if (frame === null) return false;

            // The arc as well as the legs: a mark is picked wherever it was drawn.
            const onArc =
                Math.abs(distance(frame.vertex, p) - frame.radius) <= tolerance &&
                withinSweep(frame, Math.atan2(p.y - frame.vertex.y, p.x - frame.vertex.x));

            return (
                onArc ||
                angleStrokes(frame).some(([a, b]) => distanceToSegment({ a, b }, p) <= tolerance)
            );
        }

        case 'radius': {
            const frame = radiusFrame(element, lookup);

            return (
                frame !== null &&
                distanceToSegment({ a: frame.opposite, b: frame.at }, p) <= tolerance
            );
        }

        case 'leader': {
            const frame = leaderFrame(element);

            if (frame === null) return false;

            return (
                distanceToPolyline([...frame.points, frame.shelfTo], p, false) <= tolerance ||
                distance(frame.textAt, p) <= element.geometry.fontSize
            );
        }
    }
}

/**
 * Move an element by a world delta.
 *
 * A hosted opening cannot go anywhere its wall does not: the delta is projected onto the wall
 * and applied as a change of offset, clamped so the opening stays within the wall it cuts. A
 * radius is hosted in the same way and swings round its circle instead of leaving it.
 */
export function translateElement(element: Element, delta: Point, lookup: ElementLookup): Element {
    if (element.type === 'radius') {
        const frame = radiusFrame(element, lookup);

        if (frame === null) {
            return element;
        }

        const direction = {
            x: Math.cos(element.geometry.angle),
            y: Math.sin(element.geometry.angle),
        };
        const turned = dot(delta, perpendicular(direction)) / Math.max(frame.radius, 1);

        return {
            ...element,
            geometry: { ...element.geometry, angle: element.geometry.angle + turned },
        };
    }

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

    // A radius has no position of its own to turn about, but it does have a direction, and
    // turning the drawing should turn the leader with it.
    if (element.type === 'radius') {
        return {
            ...element,
            geometry: { ...element.geometry, angle: element.geometry.angle + radians },
        };
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
