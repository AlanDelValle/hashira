import type { HatchPattern } from './types';

/**
 * What a hatch means, written down once.
 *
 * These are the conventions of NBR 6492 — the marks a Brazilian architectural drawing is read
 * by — and they are conventions rather than pictures of anything: nothing here represents a
 * real size. So every spacing below is in **millimetres on the finished sheet**, like a pen
 * weight and unlike a wall, and a concrete wall speckles the same on an A3 whether the plan is
 * plotted at 1:50 or 1:100.
 *
 * The three at the top are the ones a renovation drawing turns on, and they are the reason a
 * hatch belongs to any closed element rather than to a room: what gets marked existing, to be
 * demolished or to be built is the masonry.
 */

export type HatchKind = 'solid' | 'empty' | 'lines' | 'scatter' | 'veins';

export interface HatchDefinition {
    id: HatchPattern;
    name: string;
    kind: HatchKind;
    /** Millimetres on the sheet between lines, or between specks. */
    spacing: number;
    /** Radians clockwise from east. Lines and veins only. */
    angle: number;
    /** Radius of one speck, in sheet millimetres. */
    dot?: number;
    /** How far a vein leaves its line, as a fraction of the spacing. */
    wander?: number;
}

const DEGREES = Math.PI / 180;

/**
 * In the order the panel offers them: what a renovation says first, then what things are made
 * of, and last the ground they stand on.
 */
export const HATCHES: HatchDefinition[] = [
    // ── Renovation ───────────────────────────────────────────────────────────
    /*
     * Existing masonry is solid, which is what a wall already draws, so marking one existing
     * changes nothing on the sheet and is worth saying anyway — the drawing then states its
     * three cases rather than leaving one of them implied.
     *
     * To be demolished is empty. Some offices dash the outline instead; the convention drawn
     * in NBR 6492 is the open one, and following the standard beats following a habit.
     */
    { id: 'existing', name: 'Existing masonry', kind: 'solid', spacing: 0, angle: 0 },
    { id: 'demolish', name: 'To demolish', kind: 'empty', spacing: 0, angle: 0 },
    { id: 'new', name: 'New masonry', kind: 'lines', spacing: 1.6, angle: 45 * DEGREES },

    // ── Materials ────────────────────────────────────────────────────────────
    /*
     * Concrete in section is drawn as a stipple with its aggregate showing. This does the
     * stipple and leaves the aggregate out: it would want a second scattered shape at a second
     * size, and a denser speckle reads as concrete at every plotted scale a plan is issued at.
     */
    { id: 'concrete', name: 'Concrete', kind: 'scatter', spacing: 1.1, angle: 0, dot: 0.16 },
    /*
     * Sparse, which is the whole of it: concrete seen rather than cut is a few broken strokes
     * on an otherwise open face. At the spacing the section hatch uses it came out as a dense
     * wave and read as timber.
     */
    {
        id: 'concrete-view',
        name: 'Concrete, elevation',
        kind: 'veins',
        spacing: 7,
        angle: 65 * DEGREES,
        wander: 0.28,
    },
    { id: 'mortar', name: 'Mortar, screed', kind: 'scatter', spacing: 0.8, angle: 0, dot: 0.1 },
    { id: 'steel', name: 'Steel', kind: 'lines', spacing: 0.65, angle: 45 * DEGREES },
    { id: 'rubber', name: 'Rubber, vinyl', kind: 'scatter', spacing: 0.5, angle: 0, dot: 0.07 },
    {
        id: 'wood',
        name: 'Timber, elevation',
        kind: 'veins',
        spacing: 1.3,
        angle: 0,
        wander: 0.3,
    },
    { id: 'plywood', name: 'Plywood', kind: 'lines', spacing: 0.75, angle: 0 },

    // ── Ground and stone ─────────────────────────────────────────────────────
    { id: 'earth', name: 'Earth', kind: 'lines', spacing: 2.6, angle: 45 * DEGREES },
    { id: 'fill', name: 'Fill', kind: 'lines', spacing: 1.2, angle: 0 },
    /*
     * Ruled lines, but not ruler-straight: what tells marble in section from made ground is
     * that its beds are uneven, and drawn dead parallel the two are the same mark twice.
     */
    {
        id: 'stone',
        name: 'Stone, section',
        kind: 'veins',
        spacing: 1.5,
        angle: 0,
        wander: 0.14,
    },
    {
        id: 'stone-view',
        name: 'Stone, elevation',
        kind: 'veins',
        spacing: 3.4,
        angle: 18 * DEGREES,
        wander: 0.7,
    },
    { id: 'floor-fill', name: 'Floor build-up', kind: 'lines', spacing: 0.6, angle: 90 * DEGREES },
];

const BY_ID = new Map(HATCHES.map((hatch) => [hatch.id, hatch]));

export function findHatch(pattern: HatchPattern): HatchDefinition | undefined {
    return BY_ID.get(pattern);
}

/** For a panel: every pattern, and the one entry that means the element keeps its own fill. */
export const HATCH_OPTIONS: { value: HatchPattern | 'none'; label: string }[] = [
    { value: 'none', label: 'None' },
    ...HATCHES.map((hatch) => ({ value: hatch.id, label: hatch.name })),
];
