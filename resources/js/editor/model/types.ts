import type { Point } from '@/editor/geometry/vec';

/**
 * The document, as it is stored and sent over the wire. See docs/document-format.md.
 *
 * Two invariants hold everywhere below: lengths are millimetres, and angles are radians
 * measured clockwise. Display units and degrees exist only at the edge of the interface.
 */

export const SCHEMA_VERSION = 1;

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

export interface TextElement extends BaseElement {
    type: 'text';
    /** `fontSize` is millimetres at 1:1, so text scales with the drawing, not the screen. */
    geometry: { content: string; fontSize: number; align: TextAlign };
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
    | TextElement;

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
