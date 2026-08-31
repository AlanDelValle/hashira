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
    'seating' | 'tables' | 'beds' | 'storage' | 'kitchen' | 'bathroom' | 'structure';

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

export const ASSET_CATEGORIES: { id: AssetCategory; name: string }[] = [
    { id: 'seating', name: 'Seating' },
    { id: 'tables', name: 'Tables' },
    { id: 'beds', name: 'Beds' },
    { id: 'storage', name: 'Storage' },
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'bathroom', name: 'Bathroom' },
    { id: 'structure', name: 'Structure' },
];
