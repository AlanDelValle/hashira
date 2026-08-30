import type { Point } from '@/editor/geometry/vec';

/**
 * The document, as it is stored and sent over the wire. See docs/document-format.md.
 *
 * Two invariants hold everywhere below: lengths are millimetres, and angles are radians
 * measured clockwise. Display units and degrees exist only at the edge of the interface.
 */

/**
 * 2 added the `dimension` element. A reader that predates it would drop every dimension in a
 * drawing and then save the drawing back without them, so an older Hashira refuses the file
 * outright rather than quietly throwing away the measurements.
 */
export const SCHEMA_VERSION = 2;

export type DisplayUnit = 'mm' | 'cm' | 'm';

export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1';

export type SheetOrientation = 'portrait' | 'landscape';

export interface GridSettings {
    /** Millimetres between major grid lines. */
    size: number;
    subdivisions: number;
    visible: boolean;
    snap: boolean;
}

export interface SnapSettings {
    enabled: boolean;
    endpoint: boolean;
    midpoint: boolean;
    intersection: boolean;
    axis: boolean;
}

export interface DocumentSettings {
    unit: DisplayUnit;
    /** The denominator of the drawing scale: 50 means 1:50. */
    scale: number;
    grid: GridSettings;
    snapping: SnapSettings;
    sheet: { size: SheetSize; orientation: SheetOrientation };
    title: string;
}

export interface Layer {
    id: string;
    name: string;
    color: string;
    visible: boolean;
    locked: boolean;
    order: number;
}

/** Maps an element's local geometry into world space: rotate about the local origin, then move. */
export interface Transform {
    x: number;
    y: number;
    rotation: number;
}

export interface ElementStyle {
    stroke?: string;
    fill?: string | null;
    /** Pen weight in millimetres on the printed sheet, not in world millimetres. */
    strokeWidth?: number;
    dash?: number[] | null;
}

export interface ElementMetadata {
    createdAt?: string;
    label?: string | null;
}

interface BaseElement {
    id: string;
    layerId: string;
    transform: Transform;
    style?: ElementStyle;
    metadata?: ElementMetadata;
}

export interface WallElement extends BaseElement {
    type: 'wall';
    geometry: { a: Point; b: Point; thickness: number };
}

export interface LineElement extends BaseElement {
    type: 'line';
    geometry: { a: Point; b: Point };
}

export interface RectElement extends BaseElement {
    type: 'rect';
    /** The local origin is the centre, so rotation behaves the way a handle implies. */
    geometry: { width: number; height: number };
}

export interface CircleElement extends BaseElement {
    type: 'circle';
    geometry: { radius: number };
}

export interface PolygonElement extends BaseElement {
    type: 'polygon';
    geometry: { points: Point[]; closed: boolean };
}

export interface RoomElement extends BaseElement {
    type: 'room';
    geometry: { points: Point[] };
}

export type DoorSwing = 'left' | 'right';

/** Hosted on a wall: `offset` is the distance from the wall's `a` end to the opening's centre. */
export interface DoorElement extends BaseElement {
    type: 'door';
    geometry: {
        hostId: string;
        offset: number;
        width: number;
        swing: DoorSwing;
        flipped: boolean;
    };
}

export interface WindowElement extends BaseElement {
    type: 'window';
    geometry: { hostId: string; offset: number; width: number };
}

export type TextAlign = 'left' | 'center' | 'right';

/**
 * A measurement written on the drawing.
 *
 * `a` and `b` are the two points being measured; `offset` is how far the dimension line sits
 * from them, perpendicular to the measurement, and signed so it can go to either side. The
 * value itself is never stored — it is read off the geometry every time it is drawn, which is
 * what stops a drawing from carrying a number that no longer matches what it shows.
 */
export interface DimensionElement extends BaseElement {
    type: 'dimension';
    /** `fontSize` is millimetres at 1:1, like text: the value scales with the drawing. */
    geometry: { a: Point; b: Point; offset: number; fontSize: number };
}

export interface TextElement extends BaseElement {
    type: 'text';
    /** `fontSize` is millimetres at 1:1, so text scales with the drawing, not the screen. */
    geometry: { content: string; fontSize: number; align: TextAlign };
}

/**
 * A block from the library. The document stores which block and how big, never its geometry —
 * so a drawing stays small and a corrected block improves every drawing that uses it.
 */
export interface AssetElement extends BaseElement {
    type: 'asset';
    geometry: { assetId: string; width: number; height: number; mirrored: boolean };
}

export type Element =
    | WallElement
    | LineElement
    | RectElement
    | CircleElement
    | PolygonElement
    | RoomElement
    | DoorElement
    | WindowElement
    | AssetElement
    | TextElement
    | DimensionElement;

export type ElementType = Element['type'];

/** Elements positioned along a host wall rather than by their own transform. */
export type HostedElement = DoorElement | WindowElement;

export function isHosted(element: Element): element is HostedElement {
    return element.type === 'door' || element.type === 'window';
}

export interface HashiraDocument {
    schemaVersion: number;
    id: string;
    name: string;
    settings: DocumentSettings;
    layers: Layer[];
    elements: Element[];
}
