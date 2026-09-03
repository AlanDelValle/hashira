/**
 * The element library.
 *
 * Each block is drawn once, in a normalised 0–1 box, and scaled to whatever size the element
 * carries. That keeps a block to a couple of lines, lets the same sofa be 1.6 m or 2.1 m wide
 * without a second definition, and keeps the document tiny: an inserted block is an id and a
 * size, not a few hundred coordinates.
 *
 * Everything here is plan view, drawn the way it would be on a floor plan — outlines and the
 * few interior lines that make the object recognisable, not a picture of it.
 */

export type AssetPrimitive =
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'polyline'; points: number[]; closed: boolean }
    | { kind: 'arc'; cx: number; cy: number; r: number; from: number; to: number };

export type AssetCategory =
    | 'seating'
    | 'tables'
    | 'beds'
    | 'storage'
    | 'kitchen'
    | 'bathroom'
    | 'laundry'
    | 'office'
    | 'garage'
    | 'garden'
    | 'pool'
    | 'structure'
    | 'annotation';

export interface AssetDefinition {
    id: string;
    name: string;
    category: AssetCategory;
    /** Default size in millimetres. */
    width: number;
    height: number;
    /** The layer a freshly placed block belongs on. */
    layerId: string;
    draw: AssetPrimitive[];
    /** True for a block somebody made, as opposed to one that ships with the editor. */
    own?: boolean;
}

const r = (x: number, y: number, w: number, h: number): AssetPrimitive => ({
    kind: 'rect',
    x,
    y,
    w,
    h,
});
const l = (x1: number, y1: number, x2: number, y2: number): AssetPrimitive => ({
    kind: 'line',
    x1,
    y1,
    x2,
    y2,
});
const e = (cx: number, cy: number, rx: number, ry: number): AssetPrimitive => ({
    kind: 'ellipse',
    cx,
    cy,
    rx,
    ry,
});
const p = (points: number[], closed = false): AssetPrimitive => ({
    kind: 'polyline',
    points,
    closed,
});
const a = (cx: number, cy: number, radius: number, from: number, to: number): AssetPrimitive => ({
    kind: 'arc',
    cx,
    cy,
    r: radius,
    from,
    to,
});

const FURNITURE = 'layer_furniture';
const ARCHITECTURE = 'layer_architecture';
const ANNOTATIONS = 'layer_annotations';

/** Evenly spaced parallel lines, for stair treads and slatted shelving. */
function treads(count: number, vertical: boolean): AssetPrimitive[] {
    const lines: AssetPrimitive[] = [];

    for (let i = 1; i < count; i++) {
        const t = i / count;
        lines.push(vertical ? l(0, t, 1, t) : l(t, 0, t, 1));
    }

    return lines;
}

export const ASSET_LIBRARY: AssetDefinition[] = [
    // ── Seating ──────────────────────────────────────────────────────────────
    {
        id: 'sofa-3',
        name: 'Sofa, 3 seat',
        category: 'seating',
        width: 2100,
        height: 900,
        layerId: FURNITURE,
        draw: [
            r(0, 0, 1, 1),
            r(0.06, 0.28, 0.88, 0.66),
            l(0.353, 0.28, 0.353, 0.94),
            l(0.647, 0.28, 0.647, 0.94),
        ],
    },
    {
        id: 'sofa-2',
        name: 'Sofa, 2 seat',
        category: 'seating',
        width: 1600,
        height: 900,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.08, 0.28, 0.84, 0.66), l(0.5, 0.28, 0.5, 0.94)],
    },
    {
        id: 'armchair',
        name: 'Armchair',
        category: 'seating',
        width: 850,
        height: 850,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.14, 0.28, 0.72, 0.64)],
    },
    {
        id: 'chair',
        name: 'Chair',
        category: 'seating',
        width: 450,
        height: 500,
        layerId: FURNITURE,
        draw: [r(0.05, 0.2, 0.9, 0.8), l(0.05, 0.16, 0.95, 0.16)],
    },
    {
        id: 'stool',
        name: 'Stool',
        category: 'seating',
        width: 400,
        height: 400,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5)],
    },
    {
        id: 'bench',
        name: 'Bench',
        category: 'seating',
        width: 1200,
        height: 400,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.5, 1, 0.5)],
    },

    // ── Tables ───────────────────────────────────────────────────────────────
    {
        id: 'table-dining',
        name: 'Dining table',
        category: 'tables',
        width: 1600,
        height: 900,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1)],
    },
    {
        id: 'table-round',
        name: 'Round table',
        category: 'tables',
        width: 1200,
        height: 1200,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5)],
    },
    {
        id: 'table-coffee',
        name: 'Coffee table',
        category: 'tables',
        width: 1100,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.1, 0.16, 0.8, 0.68)],
    },
    {
        id: 'table-side',
        name: 'Side table',
        category: 'tables',
        width: 500,
        height: 500,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1)],
    },
    {
        id: 'desk',
        name: 'Desk',
        category: 'tables',
        width: 1400,
        height: 700,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0.62, 0, 0.62, 1)],
    },
    {
        id: 'console',
        name: 'Console',
        category: 'tables',
        width: 1200,
        height: 400,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.7, 1, 0.7)],
    },

    // ── Beds ─────────────────────────────────────────────────────────────────
    {
        id: 'bed-single',
        name: 'Single bed',
        category: 'beds',
        width: 900,
        height: 2000,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.08, 0.03, 0.84, 0.13), l(0, 0.25, 1, 0.25)],
    },
    {
        id: 'bed-double',
        name: 'Double bed',
        category: 'beds',
        width: 1400,
        height: 2000,
        layerId: FURNITURE,
        draw: [
            r(0, 0, 1, 1),
            r(0.05, 0.03, 0.42, 0.13),
            r(0.53, 0.03, 0.42, 0.13),
            l(0, 0.25, 1, 0.25),
        ],
    },
    {
        id: 'bed-queen',
        name: 'Queen bed',
        category: 'beds',
        width: 1600,
        height: 2000,
        layerId: FURNITURE,
        draw: [
            r(0, 0, 1, 1),
            r(0.04, 0.03, 0.44, 0.13),
            r(0.52, 0.03, 0.44, 0.13),
            l(0, 0.25, 1, 0.25),
        ],
    },
    {
        id: 'cot',
        name: 'Cot',
        category: 'beds',
        width: 700,
        height: 1300,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.1, 0.06, 0.8, 0.88)],
    },

    // ── Storage ──────────────────────────────────────────────────────────────
    {
        id: 'wardrobe',
        name: 'Wardrobe',
        category: 'storage',
        width: 1200,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.82, 1, 0.82), l(0.5, 0, 0.5, 0.82)],
    },
    {
        id: 'bookshelf',
        name: 'Bookshelf',
        category: 'storage',
        width: 900,
        height: 300,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(3, false)],
    },
    {
        id: 'drawers',
        name: 'Chest of drawers',
        category: 'storage',
        width: 800,
        height: 450,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.75, 1, 0.75), l(0.5, 0.75, 0.5, 1)],
    },
    {
        id: 'cabinet',
        name: 'Cabinet',
        category: 'storage',
        width: 600,
        height: 400,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.8, 1, 0.8)],
    },
    {
        id: 'sideboard',
        name: 'Sideboard',
        category: 'storage',
        width: 1600,
        height: 450,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.8, 1, 0.8), ...treads(3, false)],
    },

    // ── Kitchen ──────────────────────────────────────────────────────────────
    {
        id: 'counter',
        name: 'Counter',
        category: 'kitchen',
        width: 2000,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.08, 1, 0.08)],
    },
    {
        id: 'sink-kitchen',
        name: 'Kitchen sink',
        category: 'kitchen',
        width: 800,
        height: 500,
        layerId: FURNITURE,
        draw: [
            r(0, 0, 1, 1),
            r(0.08, 0.2, 0.5, 0.62),
            e(0.78, 0.5, 0.1, 0.14),
            l(0.78, 0.06, 0.78, 0.2),
        ],
    },
    {
        id: 'hob',
        name: 'Hob',
        category: 'kitchen',
        width: 600,
        height: 520,
        layerId: FURNITURE,
        draw: [
            r(0, 0, 1, 1),
            e(0.28, 0.28, 0.15, 0.15),
            e(0.72, 0.28, 0.15, 0.15),
            e(0.28, 0.72, 0.15, 0.15),
            e(0.72, 0.72, 0.15, 0.15),
        ],
    },
    {
        id: 'oven',
        name: 'Oven',
        category: 'kitchen',
        width: 600,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.12, 0.12, 0.76, 0.76), l(0.12, 0.88, 0.88, 0.88)],
    },
    {
        id: 'fridge',
        name: 'Fridge',
        category: 'kitchen',
        width: 700,
        height: 700,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.86, 1, 0.86), l(0.5, 0.86, 0.5, 1)],
    },
    {
        id: 'dishwasher',
        name: 'Dishwasher',
        category: 'kitchen',
        width: 600,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.84, 1, 0.84), e(0.5, 0.45, 0.22, 0.22)],
    },

    // ── Bathroom ─────────────────────────────────────────────────────────────
    {
        id: 'wc',
        name: 'WC',
        category: 'bathroom',
        width: 400,
        height: 700,
        layerId: FURNITURE,
        draw: [r(0.12, 0, 0.76, 0.2), e(0.5, 0.58, 0.36, 0.4)],
    },
    {
        id: 'basin',
        name: 'Basin',
        category: 'bathroom',
        width: 600,
        height: 450,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), e(0.5, 0.56, 0.36, 0.34), l(0.5, 0.04, 0.5, 0.16)],
    },
    {
        id: 'bathtub',
        name: 'Bath',
        category: 'bathroom',
        width: 1700,
        height: 750,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.06, 0.12, 0.82, 0.76), e(0.94, 0.5, 0.03, 0.05)],
    },
    {
        id: 'shower',
        name: 'Shower',
        category: 'bathroom',
        width: 900,
        height: 900,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0, 1, 1), l(1, 0, 0, 1), e(0.5, 0.5, 0.08, 0.08)],
    },
    {
        id: 'bidet',
        name: 'Bidet',
        category: 'bathroom',
        width: 380,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0.15, 0, 0.7, 0.16), e(0.5, 0.56, 0.38, 0.42)],
    },
    {
        id: 'towel-rail',
        name: 'Towel rail',
        category: 'bathroom',
        width: 600,
        height: 100,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.5, 1, 0.5)],
    },

    // ── Structure ────────────────────────────────────────────────────────────
    {
        id: 'stair-straight',
        name: 'Stair, straight',
        category: 'structure',
        width: 1000,
        height: 3000,
        layerId: ARCHITECTURE,
        draw: [
            r(0, 0, 1, 1),
            ...treads(12, true),
            p([0.5, 0.1, 0.5, 0.9]),
            p([0.38, 0.78, 0.5, 0.9, 0.62, 0.78]),
        ],
    },
    {
        id: 'stair-l',
        name: 'Stair, quarter turn',
        category: 'structure',
        width: 2000,
        height: 2000,
        layerId: ARCHITECTURE,
        draw: [
            p([0, 0, 1, 0, 1, 0.5, 0.5, 0.5, 0.5, 1, 0, 1], true),
            l(0.2, 0, 0.2, 0.5),
            l(0.4, 0, 0.4, 0.5),
            l(0.6, 0, 0.6, 0.5),
            l(0.8, 0, 0.8, 0.5),
            l(0, 0.7, 0.5, 0.7),
            l(0, 0.85, 0.5, 0.85),
        ],
    },
    {
        id: 'column',
        name: 'Column',
        category: 'structure',
        width: 300,
        height: 300,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), l(0, 0, 1, 1), l(1, 0, 0, 1)],
    },
    {
        id: 'plant',
        name: 'Plant',
        category: 'structure',
        width: 500,
        height: 500,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), a(0.5, 0.5, 0.3, 0.6, 3.2), a(0.5, 0.5, 0.16, 3.6, 6.1)],
    },

    // ── Kitchen, the rest of it ──────────────────────────────────────────────
    {
        id: 'kitchen-island',
        name: 'Island',
        category: 'kitchen',
        width: 1800,
        height: 900,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.04, 0.06, 0.92, 0.88)],
    },
    {
        id: 'kitchen-unit',
        name: 'Base unit',
        category: 'kitchen',
        width: 600,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.88, 1, 0.88)],
    },
    {
        id: 'extractor',
        name: 'Extractor hood',
        category: 'kitchen',
        width: 600,
        height: 500,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.12, 0.14, 0.76, 0.72), e(0.5, 0.5, 0.16, 0.18)],
    },
    {
        id: 'microwave',
        name: 'Microwave',
        category: 'kitchen',
        width: 500,
        height: 400,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0.72, 0, 0.72, 1)],
    },
    {
        id: 'pantry',
        name: 'Pantry',
        category: 'kitchen',
        width: 600,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(3, false), l(0, 0.88, 1, 0.88)],
    },

    // ── Bathroom, the rest of it ─────────────────────────────────────────────
    {
        id: 'shower-quadrant',
        name: 'Shower, quadrant',
        category: 'bathroom',
        width: 900,
        height: 900,
        layerId: FURNITURE,
        draw: [p([0, 0, 1, 0, 1, 1, 0, 1], true), a(0, 0, 1, 0, Math.PI / 2)],
    },
    {
        id: 'wc-wall-hung',
        name: 'WC, wall hung',
        category: 'bathroom',
        width: 360,
        height: 540,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 0.18), p([0.1, 0.18, 0.9, 0.18, 0.78, 0.92, 0.22, 0.92], true)],
    },
    {
        id: 'basin-double',
        name: 'Basin, double',
        category: 'bathroom',
        width: 1200,
        height: 500,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), e(0.27, 0.55, 0.18, 0.3), e(0.73, 0.55, 0.18, 0.3)],
    },
    {
        id: 'vanity',
        name: 'Vanity unit',
        category: 'bathroom',
        width: 900,
        height: 500,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), e(0.5, 0.52, 0.26, 0.32), l(0, 0.9, 1, 0.9)],
    },
    {
        id: 'grab-rail',
        name: 'Grab rail',
        category: 'bathroom',
        width: 800,
        height: 100,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0.08, 0, 0.08, 1), l(0.92, 0, 0.92, 1)],
    },

    // ── Laundry ──────────────────────────────────────────────────────────────
    /*
     * Sized off the appliances themselves rather than off the gap they are slotted into: a
     * washing machine is 600 wide because that is what one is, and the 50 mm either side of it
     * belongs to the joinery somebody draws round it.
     */
    {
        id: 'washing-machine',
        name: 'Washing machine',
        category: 'laundry',
        width: 600,
        height: 650,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), e(0.5, 0.5, 0.32, 0.3)],
    },
    {
        id: 'tumble-dryer',
        name: 'Tumble dryer',
        category: 'laundry',
        width: 600,
        height: 650,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), e(0.5, 0.5, 0.32, 0.3), l(0, 0.12, 1, 0.12)],
    },
    {
        id: 'washer-stack',
        name: 'Washer and dryer, stacked',
        category: 'laundry',
        width: 600,
        height: 650,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.06, 0.06, 0.88, 0.88), e(0.5, 0.5, 0.28, 0.26)],
    },
    {
        id: 'laundry-tub',
        name: 'Laundry tub',
        category: 'laundry',
        width: 520,
        height: 550,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.1, 0.18, 0.8, 0.72), l(0.5, 0, 0.5, 0.12)],
    },
    {
        id: 'laundry-counter',
        name: 'Counter with tub',
        category: 'laundry',
        width: 1200,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.06, 0.16, 0.36, 0.68), l(0.5, 0, 0.5, 1)],
    },
    {
        id: 'drying-rack',
        name: 'Drying rack',
        category: 'laundry',
        width: 1000,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(6, false)],
    },
    {
        id: 'ironing-board',
        name: 'Ironing board',
        category: 'laundry',
        width: 1400,
        height: 400,
        layerId: FURNITURE,
        draw: [p([0, 0.28, 0.7, 0.06, 1, 0.3, 1, 0.7, 0.7, 0.94, 0, 0.72], true)],
    },
    {
        id: 'water-heater',
        name: 'Water heater',
        category: 'laundry',
        width: 450,
        height: 450,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), e(0.5, 0.5, 0.34, 0.34)],
    },
    {
        id: 'laundry-shelf',
        name: 'Shelf',
        category: 'laundry',
        width: 900,
        height: 350,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.5, 1, 0.5)],
    },

    // -- Office ---------------------------------------------------------------
    {
        id: 'office-desk',
        name: 'Desk',
        category: 'office',
        width: 1600,
        height: 800,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.86, 1, 0.86)],
    },
    {
        id: 'office-desk-l',
        name: 'Desk, L shaped',
        category: 'office',
        width: 1800,
        height: 1600,
        layerId: FURNITURE,
        draw: [p([0, 0, 1, 0, 1, 0.44, 0.44, 0.44, 0.44, 1, 0, 1], true)],
    },
    {
        id: 'office-bench',
        name: 'Desks, facing pair',
        category: 'office',
        width: 1600,
        height: 1600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.5, 1, 0.5)],
    },
    {
        id: 'office-chair',
        name: 'Task chair',
        category: 'office',
        width: 600,
        height: 600,
        layerId: FURNITURE,
        draw: [e(0.5, 0.44, 0.42, 0.42), a(0.5, 0.5, 0.5, 0.5, 2.64)],
    },
    {
        id: 'pedestal',
        name: 'Pedestal',
        category: 'office',
        width: 420,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(3, true)],
    },
    {
        id: 'filing-cabinet',
        name: 'Filing cabinet',
        category: 'office',
        width: 470,
        height: 620,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(4, true)],
    },
    {
        id: 'office-cupboard',
        name: 'Cupboard',
        category: 'office',
        width: 1000,
        height: 450,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.84, 1, 0.84), l(0.5, 0, 0.5, 0.84)],
    },
    {
        id: 'meeting-table-6',
        name: 'Meeting table, 6',
        category: 'office',
        width: 2400,
        height: 1200,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1)],
    },
    {
        id: 'meeting-table-8',
        name: 'Meeting table, 8',
        category: 'office',
        width: 3000,
        height: 1200,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1)],
    },
    {
        id: 'meeting-table-round',
        name: 'Meeting table, round',
        category: 'office',
        width: 1200,
        height: 1200,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5)],
    },
    {
        id: 'printer',
        name: 'Printer',
        category: 'office',
        width: 600,
        height: 550,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0.1, 0.28, 0.9, 0.28)],
    },
    {
        id: 'screen-partition',
        name: 'Screen',
        category: 'office',
        width: 1400,
        height: 60,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1)],
    },

    // -- Garage ---------------------------------------------------------------
    /*
     * A vehicle is drawn as the space it takes up and enough of its shape to read which way it
     * is pointing: the nose tapers, and the cabin is a band across it. Anything more detailed
     * is a picture of a car rather than a plan of a garage, and at 1:50 it is only in the way.
     */
    {
        id: 'car',
        name: 'Car',
        category: 'garage',
        width: 4500,
        height: 1800,
        layerId: FURNITURE,
        draw: [
            p([0.06, 0, 0.94, 0, 1, 0.22, 1, 0.78, 0.94, 1, 0.06, 1, 0, 0.78, 0, 0.22], true),
            l(0.3, 0.06, 0.3, 0.94),
            l(0.58, 0.06, 0.58, 0.94),
        ],
    },
    {
        id: 'car-compact',
        name: 'Car, compact',
        category: 'garage',
        width: 3800,
        height: 1700,
        layerId: FURNITURE,
        draw: [
            p([0.08, 0, 0.92, 0, 1, 0.24, 1, 0.76, 0.92, 1, 0.08, 1, 0, 0.76, 0, 0.24], true),
            l(0.32, 0.06, 0.32, 0.94),
            l(0.62, 0.06, 0.62, 0.94),
        ],
    },
    {
        id: 'car-suv',
        name: 'Car, SUV',
        category: 'garage',
        width: 4900,
        height: 1950,
        layerId: FURNITURE,
        draw: [
            p([0.05, 0, 0.95, 0, 1, 0.18, 1, 0.82, 0.95, 1, 0.05, 1, 0, 0.82, 0, 0.18], true),
            l(0.28, 0.06, 0.28, 0.94),
            l(0.6, 0.06, 0.6, 0.94),
        ],
    },
    {
        id: 'van',
        name: 'Van',
        category: 'garage',
        width: 5400,
        height: 2000,
        layerId: FURNITURE,
        draw: [
            p([0.04, 0, 0.98, 0, 1, 0.16, 1, 0.84, 0.98, 1, 0.04, 1, 0, 0.84, 0, 0.16], true),
            l(0.24, 0.04, 0.24, 0.96),
        ],
    },
    {
        id: 'motorcycle',
        name: 'Motorcycle',
        category: 'garage',
        width: 2100,
        height: 800,
        layerId: FURNITURE,
        draw: [
            p(
                [
                    0.02, 0.4, 0.28, 0.28, 0.72, 0.28, 0.98, 0.4, 0.98, 0.6, 0.72, 0.72, 0.28, 0.72,
                    0.02, 0.6,
                ],
                true,
            ),
            l(0.3, 0.06, 0.3, 0.94),
        ],
    },
    {
        id: 'bicycle',
        name: 'Bicycle',
        category: 'garage',
        width: 1800,
        height: 600,
        layerId: FURNITURE,
        draw: [
            e(0.14, 0.5, 0.13, 0.4),
            e(0.86, 0.5, 0.13, 0.4),
            l(0.14, 0.5, 0.86, 0.5),
            l(0.5, 0.14, 0.5, 0.86),
        ],
    },
    {
        id: 'parking-bay',
        name: 'Parking bay',
        category: 'garage',
        width: 2500,
        height: 5000,
        layerId: ARCHITECTURE,
        // Open at the end you drive in from, which is how a bay is marked on the ground.
        draw: [p([0, 0, 1, 0, 1, 1, 0, 1], false)],
    },
    {
        id: 'parking-accessible',
        name: 'Parking bay, accessible',
        category: 'garage',
        width: 3500,
        height: 5000,
        layerId: ARCHITECTURE,
        draw: [
            p([0, 0, 1, 0, 1, 1, 0, 1], false),
            l(0.71, 0, 0.71, 1),
            l(0.71, 0.16, 1, 0),
            l(0.71, 0.37, 1, 0.21),
            l(0.71, 0.58, 1, 0.42),
            l(0.71, 0.79, 1, 0.63),
            l(0.71, 1, 1, 0.84),
        ],
    },
    {
        id: 'workbench',
        name: 'Workbench',
        category: 'garage',
        width: 1800,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.2, 1, 0.2), l(0.72, 0.2, 0.72, 1)],
    },
    {
        id: 'garage-shelving',
        name: 'Shelving',
        category: 'garage',
        width: 1200,
        height: 450,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), ...treads(4, false), l(0, 0.5, 1, 0.5)],
    },

    // -- Garden ---------------------------------------------------------------
    /*
     * A tree is drawn at the spread of its canopy, which is what a plan wants it for: what it
     * shades, what it overhangs, and what cannot be built under it. Three sizes rather than one
     * block stretched to any of them, because the size is the decision being recorded.
     */
    {
        id: 'tree-small',
        name: 'Tree, small',
        category: 'garden',
        width: 2000,
        height: 2000,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), a(0.5, 0.5, 0.3, 0.4, 3.0), e(0.5, 0.5, 0.06, 0.06)],
    },
    {
        id: 'tree-medium',
        name: 'Tree, medium',
        category: 'garden',
        width: 4000,
        height: 4000,
        layerId: FURNITURE,
        draw: [
            e(0.5, 0.5, 0.5, 0.5),
            a(0.5, 0.5, 0.36, 0.5, 3.2),
            a(0.5, 0.5, 0.2, 3.6, 6.1),
            e(0.5, 0.5, 0.05, 0.05),
        ],
    },
    {
        id: 'tree-large',
        name: 'Tree, large',
        category: 'garden',
        width: 7000,
        height: 7000,
        layerId: FURNITURE,
        draw: [
            e(0.5, 0.5, 0.5, 0.5),
            e(0.5, 0.5, 0.38, 0.38),
            a(0.5, 0.5, 0.22, 0.6, 3.4),
            e(0.5, 0.5, 0.04, 0.04),
        ],
    },
    {
        id: 'shrub',
        name: 'Shrub',
        category: 'garden',
        width: 1000,
        height: 1000,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), a(0.5, 0.5, 0.28, 0.8, 4.2)],
    },
    {
        id: 'hedge',
        name: 'Hedge',
        category: 'garden',
        width: 2000,
        height: 600,
        layerId: FURNITURE,
        draw: [
            e(0.1, 0.5, 0.135, 0.45),
            e(0.3, 0.5, 0.135, 0.45),
            e(0.5, 0.5, 0.135, 0.45),
            e(0.7, 0.5, 0.135, 0.45),
            e(0.9, 0.5, 0.135, 0.45),
        ],
    },
    {
        id: 'planter',
        name: 'Planter',
        category: 'garden',
        width: 1200,
        height: 400,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.05, 0.14, 0.9, 0.72)],
    },
    {
        id: 'plant-pot',
        name: 'Pot',
        category: 'garden',
        width: 500,
        height: 500,
        layerId: FURNITURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), e(0.5, 0.5, 0.36, 0.36)],
    },
    {
        id: 'pergola',
        name: 'Pergola',
        category: 'garden',
        width: 3000,
        height: 3000,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), ...treads(7, false)],
    },
    {
        id: 'deck',
        name: 'Deck',
        category: 'garden',
        width: 4000,
        height: 3000,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), ...treads(12, true)],
    },
    {
        id: 'garden-bench',
        name: 'Bench',
        category: 'garden',
        width: 1500,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0, 0.72, 1, 0.72)],
    },
    {
        id: 'garden-table',
        name: 'Table and chairs',
        category: 'garden',
        width: 1600,
        height: 900,
        layerId: FURNITURE,
        draw: [
            r(0.18, 0.16, 0.64, 0.68),
            r(0, 0.3, 0.14, 0.4),
            r(0.86, 0.3, 0.14, 0.4),
            r(0.35, 0, 0.3, 0.12),
            r(0.35, 0.88, 0.3, 0.12),
        ],
    },
    {
        id: 'lounger',
        name: 'Sun lounger',
        category: 'garden',
        width: 2000,
        height: 700,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), l(0.3, 0, 0.3, 1), l(0.42, 0, 0.42, 1)],
    },
    {
        id: 'barbecue',
        name: 'Barbecue',
        category: 'garden',
        width: 1200,
        height: 600,
        layerId: FURNITURE,
        draw: [r(0, 0, 1, 1), r(0.08, 0.12, 0.5, 0.76), ...treads(5, true)],
    },
    {
        id: 'stepping-path',
        name: 'Stepping stones',
        category: 'garden',
        width: 2400,
        height: 600,
        layerId: ARCHITECTURE,
        draw: [
            r(0.02, 0.2, 0.18, 0.6),
            r(0.28, 0.2, 0.18, 0.6),
            r(0.54, 0.2, 0.18, 0.6),
            r(0.8, 0.2, 0.18, 0.6),
        ],
    },

    // -- Pool -----------------------------------------------------------------
    /*
     * A pool is the water, not the coping round it: the block is the wet edge, which is what
     * gets set out and what a terrace is then drawn against. The plant room is here rather than
     * in the garden because it only exists for the pool, and putting it anywhere else is how it
     * gets forgotten.
     */
    {
        id: 'pool-rect',
        name: 'Pool, rectangular',
        category: 'pool',
        width: 8000,
        height: 4000,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), r(0.02, 0.04, 0.96, 0.92)],
    },
    {
        id: 'pool-oval',
        name: 'Pool, oval',
        category: 'pool',
        width: 7000,
        height: 3500,
        layerId: ARCHITECTURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), e(0.5, 0.5, 0.47, 0.44)],
    },
    {
        id: 'pool-infinity',
        name: 'Pool, infinity edge',
        category: 'pool',
        width: 10000,
        height: 4000,
        layerId: ARCHITECTURE,
        // The overflow edge is the heavier one: three lines rather than one, which is the weir,
        // the lip and the channel behind it.
        draw: [r(0, 0, 1, 1), l(0, 0.94, 1, 0.94), l(0, 0.88, 1, 0.88), r(0.02, 0.04, 0.96, 0.8)],
    },
    {
        id: 'spa',
        name: 'Spa',
        category: 'pool',
        width: 2200,
        height: 2200,
        layerId: ARCHITECTURE,
        draw: [e(0.5, 0.5, 0.5, 0.5), e(0.5, 0.5, 0.34, 0.34), e(0.5, 0.5, 0.1, 0.1)],
    },
    {
        id: 'pool-steps',
        name: 'Pool steps',
        category: 'pool',
        width: 1600,
        height: 900,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), ...treads(3, true)],
    },
    {
        id: 'pool-beach',
        name: 'Beach entry',
        category: 'pool',
        width: 3000,
        height: 2000,
        layerId: ARCHITECTURE,
        // Three contours off the top edge, which is how a graduated entry is drawn: the water
        // gets shallower towards the shore rather than stopping at a wall.
        draw: [
            p([0, 0, 1, 0, 1, 1, 0, 1], false),
            a(0.5, 0, 0.46, 0, 3.14159),
            a(0.5, 0, 0.32, 0, 3.14159),
            a(0.5, 0, 0.18, 0, 3.14159),
        ],
    },
    {
        id: 'pool-ladder',
        name: 'Pool ladder',
        category: 'pool',
        width: 600,
        height: 400,
        layerId: ARCHITECTURE,
        draw: [
            l(0.2, 0, 0.2, 1),
            l(0.8, 0, 0.8, 1),
            l(0.2, 0.33, 0.8, 0.33),
            l(0.2, 0.66, 0.8, 0.66),
        ],
    },
    {
        id: 'pool-plant',
        name: 'Plant room',
        category: 'pool',
        width: 1500,
        height: 1200,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), e(0.32, 0.5, 0.22, 0.28), r(0.62, 0.24, 0.28, 0.52)],
    },
    {
        id: 'outdoor-shower',
        name: 'Outdoor shower',
        category: 'pool',
        width: 900,
        height: 900,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), e(0.5, 0.5, 0.22, 0.22), e(0.5, 0.5, 0.06, 0.06)],
    },

    // ── Structure, the pieces people move through ─────────────────────────────
    {
        id: 'stair-u',
        name: 'Stair, half turn',
        category: 'structure',
        width: 2500,
        height: 3000,
        layerId: ARCHITECTURE,
        draw: [
            r(0, 0, 1, 1),
            l(0.48, 0, 0.48, 0.82),
            l(0.52, 0, 0.52, 0.82),
            l(0, 0.14, 0.48, 0.14),
            l(0, 0.28, 0.48, 0.28),
            l(0, 0.42, 0.48, 0.42),
            l(0, 0.56, 0.48, 0.56),
            l(0.52, 0.14, 1, 0.14),
            l(0.52, 0.28, 1, 0.28),
            l(0.52, 0.42, 1, 0.42),
            l(0.52, 0.56, 1, 0.56),
            l(0, 0.82, 1, 0.82),
        ],
    },
    {
        id: 'stair-spiral',
        name: 'Stair, spiral',
        category: 'structure',
        width: 2000,
        height: 2000,
        layerId: ARCHITECTURE,
        draw: [
            e(0.5, 0.5, 0.5, 0.5),
            e(0.5, 0.5, 0.12, 0.12),
            l(0.5, 0, 0.5, 0.38),
            l(0.85, 0.15, 0.58, 0.42),
            l(1, 0.5, 0.62, 0.5),
            l(0.85, 0.85, 0.58, 0.58),
            l(0.5, 1, 0.5, 0.62),
            l(0.15, 0.85, 0.42, 0.58),
            l(0, 0.5, 0.38, 0.5),
            l(0.15, 0.15, 0.42, 0.42),
        ],
    },
    {
        id: 'ramp',
        name: 'Ramp',
        category: 'structure',
        width: 1200,
        height: 6000,
        layerId: ARCHITECTURE,
        // The arrow runs up the slope, which is the one thing a ramp in plan has to say.
        draw: [r(0, 0, 1, 1), l(0.5, 0.9, 0.5, 0.1), p([0.34, 0.24, 0.5, 0.1, 0.66, 0.24])],
    },
    {
        id: 'lift',
        name: 'Lift',
        category: 'structure',
        width: 2000,
        height: 2000,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), l(0, 0, 1, 1), l(1, 0, 0, 1), l(0.2, 1, 0.8, 1)],
    },
    {
        id: 'platform-lift',
        name: 'Platform lift',
        category: 'structure',
        width: 1500,
        height: 1100,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), r(0.1, 0.12, 0.8, 0.76), p([0.42, 0.62, 0.5, 0.34, 0.58, 0.62])],
    },
    {
        id: 'handrail',
        name: 'Handrail',
        category: 'structure',
        width: 2000,
        height: 80,
        layerId: ARCHITECTURE,
        draw: [r(0, 0, 1, 1), l(0.25, 0, 0.25, 1), l(0.5, 0, 0.5, 1), l(0.75, 0, 0.75, 1)],
    },

    // ── Annotation ───────────────────────────────────────────────────────────
    /*
     * Marks that belong to the print rather than to the building. They land on the annotations
     * layer, so hiding it takes the whole apparatus of a sheet off the drawing at once.
     */
    {
        id: 'north',
        name: 'North point',
        category: 'annotation',
        width: 700,
        height: 900,
        layerId: ANNOTATIONS,
        draw: [
            // A pointer with a hollow half and a filled one, which is how a north point reads
            // as a direction rather than as an arrowhead.
            p([0.5, 0, 0.85, 1, 0.5, 0.72], true),
            p([0.5, 0, 0.15, 1, 0.5, 0.72], true),
            e(0.5, 0.42, 0.5, 0.5),
        ],
    },
    {
        id: 'break-line',
        name: 'Break line',
        category: 'annotation',
        width: 2000,
        height: 200,
        layerId: ANNOTATIONS,
        draw: [p([0, 0.5, 0.42, 0.5, 0.47, 0, 0.53, 1, 0.58, 0.5, 1, 0.5])],
    },
];

const BY_ID = new Map(ASSET_LIBRARY.map((asset) => [asset.id, asset]));

/**
 * Blocks somebody made, which arrive from the server rather than from this file.
 *
 * They are held apart from the built-in library because they come and go with a session and
 * with a drawing: opening a plan registers the blocks that plan uses, so a drawing shared by
 * someone else paints their sofa without the viewer having to own it. Everything downstream —
 * the painter, the exporters, the thumbnails — takes an `AssetDefinition` and neither knows
 * nor cares which of the two it came from.
 */
const OWN: Map<string, AssetDefinition> = new Map();

/** Add to what the editor can resolve. Registering the same id twice keeps the newer one. */
export function registerAssets(definitions: readonly AssetDefinition[]): void {
    for (const definition of definitions) {
        OWN.set(definition.id, { ...definition, own: true });
    }
}

export function forgetAsset(id: string): void {
    OWN.delete(id);
}

export function findAsset(id: string): AssetDefinition | undefined {
    return BY_ID.get(id) ?? OWN.get(id);
}

/**
 * In the order a house is walked rather than alphabetically: the rooms people live in, then
 * the wet ones, then work, cars and outside — and last the two shelves that are not furniture
 * at all, the building's own pieces and the marks that belong to the sheet.
 */
export const ASSET_CATEGORIES: { id: AssetCategory; name: string }[] = [
    { id: 'seating', name: 'Seating' },
    { id: 'tables', name: 'Tables' },
    { id: 'beds', name: 'Beds' },
    { id: 'storage', name: 'Storage' },
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'bathroom', name: 'Bathroom' },
    { id: 'laundry', name: 'Laundry' },
    { id: 'office', name: 'Office' },
    { id: 'garage', name: 'Garage' },
    { id: 'garden', name: 'Garden' },
    { id: 'pool', name: 'Pool' },
    { id: 'structure', name: 'Structure' },
    { id: 'annotation', name: 'Annotation' },
];
