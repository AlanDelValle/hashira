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
 *
 * 3 is the rest of the measured drawing: a dimension became a chain of points rather than a
 * pair of them, and `angle`, `radius` and `leader` joined it.
 *
 * 4 added the `underlay`: a page of somebody else's drawing to trace over.
 *
 * 5 gave a drawing more than one sheet of paper. `settings.sheet` — one page size, framing
 * whatever there was — became `settings.sheets`, a list of pages each with its own size,
 * scale and view of the drawing.
 *
 * 6 is the drawing as something issued rather than only drawn: `settings.titleBlock` holds
 * what a title block says beyond the title, and the `cloud` element is the mark that says
 * which part of the plan changed since the last print.
 *
 * 7 is the sheet as a document rather than a picture: `settings.notes` is what the print says
 * in words, printed in a strip beside the drawing. A reader that predates it drops the notes
 * and saves the drawing back without them — which is the whole reason this is a number.
 *
 * 8 is every other way a wall gets opened. A `door` gained `leaf` — how it operates — and
 * `head`, whether it is closed square or arched, so that a double door, a sliding door, a
 * folding door, an overhead garage door, a gate and a plain cased opening are one hosted
 * opening rather than six element types. An older reader would take `leaf: 'sliding'` for a
 * door it knows how to draw and paint a swing that is not there.
 */
export const SCHEMA_VERSION = 8;

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

/**
 * A sheet of paper the drawing is printed on.
 *
 * A drawing is drawn at full size and printed at a ratio, and a sheet is where that ratio is
 * finally decided: a page size, the scale plotted on it, and which part of the drawing it
 * shows. Paper is not drawing — a sheet holds no geometry and nothing is ever drawn *into*
 * one, which is why it lives in the settings rather than among the elements.
 *
 * `centre` is the world point the middle of the page looks at, and the page then shows
 * exactly what fits around it: the frame is a physical size, so the scale decides the extent
 * rather than the other way round. `null` means the sheet frames the whole drawing and steps
 * its scale back until it fits — which is what every drawing did before it had sheets, and
 * what a new one still does.
 */
export interface Sheet {
    id: string;
    name: string;
    size: SheetSize;
    orientation: SheetOrientation;
    /** The denominator of the plotted scale: 50 means 1:50. */
    scale: number;
    centre: Point | null;
}

/**
 * What a title block says, beyond the drawing's own name.
 *
 * Held on the document rather than on each sheet, because these are facts about the job and
 * not about the page: every sheet of a set is drawn by the same person for the same client.
 * What varies per page — which sheet this is — the sheet already knows its own name for.
 *
 * `date` is written as it is issued rather than derived, because a drawing carries the day it
 * was issued and not the day it was printed. Left empty, the print falls back to today, which
 * is what it did before there was anywhere to say otherwise.
 */
export interface TitleBlock {
    project: string;
    client: string;
    drawnBy: string;
    revision: string;
    date: string;
}

export interface DocumentSettings {
    unit: DisplayUnit;
    /** The denominator of the drawing scale: 50 means 1:50. */
    scale: number;
    grid: GridSettings;
    snapping: SnapSettings;
    /** At least one, in the order they are printed. */
    sheets: Sheet[];
    title: string;
    titleBlock: TitleBlock;
    /**
     * What the sheet says in words: one note to a line, printed down the strip beside the
     * drawing. A property of the drawing rather than of a page, like the title block, so a set
     * of sheets cannot carry two different versions of the same instruction.
     */
    notes: string;
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

/**
 * How an opening operates, which is what decides the symbol drawn in plan.
 *
 * These are ways of moving rather than things: a sliding gate is `sliding`, and `gate` is the
 * one that swings — drawn lighter, because a gate is a frame in a boundary and not a slab in a
 * partition. `none` is a cased opening with nothing in it: a doorway, an archway, a pass.
 */
export type DoorLeaf = 'single' | 'double' | 'sliding' | 'folding' | 'overhead' | 'gate' | 'none';

/**
 * How the opening is closed at the top.
 *
 * A plan is a section cut at about 1.5 m and the head is above it, so an arch is not a curve
 * here: it is the dashed line that says something spans overhead, which is the convention for
 * everything above the cut plane. The rise is deliberately not stored — nothing in a plan
 * reads it, and this format does not carry numbers nothing checks. It arrives with elevations.
 */
export type OpeningHead = 'square' | 'arch';

/** Hosted on a wall: `offset` is the distance from the wall's `a` end to the opening's centre. */
export interface DoorElement extends BaseElement {
    type: 'door';
    geometry: {
        hostId: string;
        offset: number;
        width: number;
        swing: DoorSwing;
        flipped: boolean;
        leaf: DoorLeaf;
        head: OpeningHead;
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
 * `points` are the points being measured, two or more of them: each consecutive pair is a
 * measurement of its own and they all share one dimension line, which is what a chain of
 * dimensions is. `offset` is how far that line sits from the points, perpendicular to the run
 * and signed so it can go to either side. The value itself is never stored — it is read off
 * the geometry every time it is drawn, which is what stops a drawing from carrying a number
 * that no longer matches what it shows.
 */
export interface DimensionElement extends BaseElement {
    type: 'dimension';
    /** `fontSize` is millimetres at 1:1, like text: the value scales with the drawing. */
    geometry: { points: Point[]; offset: number; fontSize: number };
}

/**
 * An angle measured at a corner.
 *
 * `vertex` is the corner and `from` and `to` are a point on each of its two legs — points
 * rather than angles, so that the measurement is of two directions in the drawing and moves
 * when they do. `radius` is how far out from the corner the arc is struck. The lesser of the
 * two angles is the one measured; the reflex angle is not what anybody means by a corner.
 */
export interface AngleElement extends BaseElement {
    type: 'angle';
    geometry: { vertex: Point; from: Point; to: Point; radius: number; fontSize: number };
}

/**
 * The radius or the diameter of a circle, hosted on the circle it measures.
 *
 * Like an opening on a wall, this has no independent position: it stores which circle and
 * which way round the leader points, so resizing or moving the circle takes the measurement
 * with it and the value cannot come to disagree with the thing it is measuring.
 */
export interface RadiusElement extends BaseElement {
    type: 'radius';
    geometry: { hostId: string; angle: number; diameter: boolean; fontSize: number };
}

/**
 * A note with a line pointing at what it is about.
 *
 * `points` begins at the thing being annotated and ends where the words are written, with as
 * many bends in between as were drawn. Unlike a measurement, the words are the content: there
 * is nothing in the geometry to derive them from.
 */
export interface LeaderElement extends BaseElement {
    type: 'leader';
    geometry: { points: Point[]; content: string; fontSize: number };
}

/**
 * A revision cloud: the mark that says which part of the drawing changed.
 *
 * A closed run of points, drawn as a chain of bumps along it rather than as the run itself —
 * so it reads as a note about the drawing rather than as something in it. `radius` is the size
 * of one bump in millimetres at 1:1, like text: it scales with the drawing, so a cloud is the
 * same size on the sheet however the plan is plotted.
 */
export interface CloudElement extends BaseElement {
    type: 'cloud';
    geometry: { points: Point[]; radius: number };
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

/**
 * A page to trace over: a rasterised page of an imported PDF, placed at a size.
 *
 * Like a block, the document stores which picture rather than the picture itself — the page
 * is megabytes and a drawing is kilobytes. Unlike everything else in a drawing, it is not
 * *of* the drawing: it is never exported, because what it holds is usually somebody else's
 * survey and a plan that quietly contains it is a plan nobody can publish.
 */
export interface UnderlayElement extends BaseElement {
    type: 'underlay';
    /** `opacity` is 0–1: an underlay is drawn back so the drawing on top of it reads. */
    geometry: { underlayId: string; width: number; height: number; opacity: number };
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
    | DimensionElement
    | AngleElement
    | RadiusElement
    | LeaderElement
    | CloudElement
    | UnderlayElement;

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
