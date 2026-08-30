import { boundsCentre, boundsFromPoints } from '@/editor/geometry/bbox';
import { midpoint, subtract, type Point } from '@/editor/geometry/vec';
import type { AssetDefinition } from '@/editor/assets/library';

import { newId } from './id';
import type {
    AssetElement,
    CircleElement,
    DimensionElement,
    DoorElement,
    LineElement,
    PolygonElement,
    RectElement,
    RoomElement,
    TextElement,
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

/**
 * A measurement between two points. `offset` is signed: which side of the measurement the
 * dimension line sits on is a decision, not a property of the geometry.
 */
export function createDimension(
    a: Point,
    b: Point,
    offset: number,
    layerId: string,
    fontSize = DEFAULT_DIMENSION_SIZE,
): DimensionElement {
    const centre = midpoint(a, b);

    return {
        id: newId(),
        type: 'dimension',
        layerId,
        transform: { x: centre.x, y: centre.y, rotation: 0 },
        geometry: { a: subtract(a, centre), b: subtract(b, centre), offset, fontSize },
        metadata: metadata(),
    };
}
