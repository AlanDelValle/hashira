import { boundsCentre, boundsFromPoints } from '@/editor/geometry/bbox';
import { distance, midpoint, subtract, type Point } from '@/editor/geometry/vec';
import type { AssetDefinition } from '@/editor/assets/library';

import { newId } from './id';
import type {
    AngleElement,
    AssetElement,
    CircleElement,
    CloudElement,
    DimensionElement,
    LeaderElement,
    RadiusElement,
    DoorElement,
    LineElement,
    PolygonElement,
    RectElement,
    RoomElement,
    TextElement,
    UnderlayElement,
    WallElement,
    WindowElement,
} from './types';

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

export const DEFAULT_DOOR_WIDTH = 900;
export const DEFAULT_WINDOW_WIDTH = 1200;

export function createRoom(points: readonly Point[], layerId: string): RoomElement | null {
    const bounds = boundsFromPoints(points);

    if (bounds === null || points.length < 3) {
        return null;
    }

    const centre = boundsCentre(bounds);

    return {
        id: newId(),
        type: 'room',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { points: points.map((p) => subtract(p, centre)) },
        metadata: metadata(),
    };
}

/**
 * Openings carry no transform of their own — their position is the distance along the wall
 * they cut, so the identity transform here is not a placeholder but the truth.
 */
export function createDoor(
    hostId: string,
    offset: number,
    layerId: string,
    width = DEFAULT_DOOR_WIDTH,
): DoorElement {
    return {
        id: newId(),
        type: 'door',
        layerId,
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: { hostId, offset, width, swing: 'left', flipped: false },
        metadata: metadata(),
    };
}

export function createWindow(
    hostId: string,
    offset: number,
    layerId: string,
    width = DEFAULT_WINDOW_WIDTH,
): WindowElement {
    return {
        id: newId(),
        type: 'window',
        layerId,
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: { hostId, offset, width },
        metadata: metadata(),
    };
}

export function createAsset(
    definition: AssetDefinition,
    centre: Point,
    layerId?: string,
): AssetElement {
    return {
        id: newId(),
        type: 'asset',
        layerId: layerId ?? definition.layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: {
            assetId: definition.id,
            width: definition.width,
            height: definition.height,
            mirrored: false,
        },
        metadata: metadata(),
    };
}

/**
 * Cap height in millimetres at 1:1. At 1:50 — the default scale — 250 mm plots as 5 mm on the
 * sheet, which is what a room label is drawn at by hand.
 */
export const DEFAULT_TEXT_SIZE = 250;

/**
 * Text is the one element whose transform is not its centre: `at` is the anchor the string is
 * set out from, and `align` decides which end of the string lands on it. That is what makes a
 * label stay put when its wording changes, instead of drifting as the text gets longer.
 */
export function createText(
    content: string,
    at: Point,
    layerId: string,
    fontSize = DEFAULT_TEXT_SIZE,
): TextElement {
    return {
        id: newId(),
        type: 'text',
        layerId,
        transform: { x: at.x, y: at.y, rotation: 0 },
        geometry: { content, fontSize, align: 'center' },
        metadata: metadata(),
    };
}

/**
 * Cap height of a dimension's value, in millimetres at 1:1 — a little smaller than a room
 * label, because a measurement is read when it is looked for and a label is read at a glance.
 */
export const DEFAULT_DIMENSION_SIZE = 200;

/** A bump about four millimetres across on a 1:50 sheet, which is what a cloud is drawn at. */
export const DEFAULT_CLOUD_RADIUS = 200;

/**
 * A revision cloud around a run of points.
 *
 * Closed always: a cloud says "this part changed", and a part has an edge all the way round.
 */
export function createCloud(
    points: readonly Point[],
    layerId: string,
    radius = DEFAULT_CLOUD_RADIUS,
): CloudElement | null {
    const bounds = boundsFromPoints(points);

    if (bounds === null || points.length < 3) {
        return null;
    }

    const centre = boundsCentre(bounds);

    return {
        id: newId(),
        type: 'cloud',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { points: points.map((p) => subtract(p, centre)), radius },
        metadata: metadata(),
    };
}

/**
 * A measurement between two points. `offset` is signed: which side of the measurement the
 * dimension line sits on is a decision, not a property of the geometry.
 */
export function createDimension(
    points: readonly Point[],
    offset: number,
    layerId: string,
    fontSize = DEFAULT_DIMENSION_SIZE,
): DimensionElement {
    const bounds = boundsFromPoints(points);
    const centre = bounds === null ? (points[0] ?? { x: 0, y: 0 }) : boundsCentre(bounds);

    return {
        id: newId(),
        type: 'dimension',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: {
            points: points.map((p) => subtract(p, centre)),
            offset,
            fontSize,
        },
        metadata: metadata(),
    };
}

/**
 * How far out from a corner an angle's arc is struck by default: comfortably inside the
 * shorter of the two legs, so the arc reads as belonging to that corner and not as a circle
 * drawn through the drawing.
 */
const ANGLE_ARC_FRACTION = 0.6;

/**
 * An angle at a corner, measured between the two legs that leave it.
 *
 * The legs are stored as points rather than as directions so that the measurement is of two
 * places in the drawing: it is the same decision as a dimension storing what it measures
 * instead of the number it came to.
 */
export function createAngle(
    vertex: Point,
    from: Point,
    to: Point,
    layerId: string,
    fontSize = DEFAULT_DIMENSION_SIZE,
    radius?: number,
): AngleElement {
    const legs = Math.min(distance(vertex, from), distance(vertex, to));

    return {
        id: newId(),
        type: 'angle',
        layerId,
        transform: { x: vertex.x, y: vertex.y, rotation: 0 },
        geometry: {
            vertex: { x: 0, y: 0 },
            from: subtract(from, vertex),
            to: subtract(to, vertex),
            radius: Math.max(radius ?? legs * ANGLE_ARC_FRACTION, 1),
            fontSize,
        },
        metadata: metadata(),
    };
}

/**
 * A radius or diameter on a circle. Hosted like an opening: it stores which circle rather
 * than where the circle happens to be, so the measurement follows it.
 */
export function createRadius(
    hostId: string,
    angle: number,
    layerId: string,
    diameter = false,
    fontSize = DEFAULT_DIMENSION_SIZE,
): RadiusElement {
    return {
        id: newId(),
        type: 'radius',
        layerId,
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: { hostId, angle, diameter, fontSize },
        metadata: metadata(),
    };
}

/**
 * How far back an imported page is drawn. Faint enough that a line drawn over it is clearly
 * the drawing, dark enough to trace.
 */
export const DEFAULT_UNDERLAY_OPACITY = 0.45;

/** The layer a page to trace over lands on, so it can be hidden and locked on its own. */
export const UNDERLAY_LAYER = 'layer_underlay';

/** A page to trace over, placed at its own size with its centre on `centre`. */
export function createUnderlay(
    underlayId: string,
    centre: Point,
    width: number,
    height: number,
    layerId = UNDERLAY_LAYER,
): UnderlayElement {
    return {
        id: newId(),
        type: 'underlay',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { underlayId, width, height, opacity: DEFAULT_UNDERLAY_OPACITY },
        metadata: metadata(),
    };
}

/** A note, and the line from the thing it is about to where the words are written. */
export function createLeader(
    points: readonly Point[],
    content: string,
    layerId: string,
    fontSize = DEFAULT_TEXT_SIZE,
): LeaderElement {
    const bounds = boundsFromPoints(points);
    const centre = bounds === null ? (points[0] ?? { x: 0, y: 0 }) : boundsCentre(bounds);

    return {
        id: newId(),
        type: 'leader',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: {
            points: points.map((p) => subtract(p, centre)),
            content,
            fontSize,
        },
        metadata: metadata(),
    };
}
