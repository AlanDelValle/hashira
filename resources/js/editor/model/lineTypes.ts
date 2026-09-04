import type { LineType } from './types';

/**
 * What a line means, written down once.
 *
 * These are the line types of NBR 8403, the marks a Brazilian technical drawing is read by,
 * and like a hatch they are conventions rather than pictures of anything: nothing here
 * represents a real size. So every length below is in **millimetres on the finished sheet**,
 * like a pen weight and unlike a wall, and a centre line is dashed the same on an A3 whether
 * the plan is plotted at 1:50 or 1:100.
 *
 * They are offered on the shapes somebody draws for their own sake — a line, a rectangle, a
 * polygon and a circle. A wall, an opening, a room, a dimension and a hatch keep the weights
 * the editor draws them at, because what those mean is already decided by what they are. The
 * editor cannot know that a run is a centre line, an axis or the projection of an eave; the
 * person drawing it can, and this is how they say so.
 *
 * The standard's ninth type is not here. Contínua com zigue-zague is the break line, already
 * in the block library as `break-line`: the run itself deviates, so it was never a dash
 * pattern to begin with, and a convention the library already draws does not need a second
 * way to be drawn.
 */

/** The three widths of a line group, as the standard rules them. */
export type LineWeight = 'narrow' | 'wide' | 'extra-wide';

/**
 * Group 0,25 of the standard's table: estreita 0,13, larga 0,25, extralarga 0,50.
 *
 * It is the row the drawing was already on, which is why naming it moved nothing. A line, a
 * rectangle, a polygon and a circle have always been stroked at 0.25 mm — exactly _larga_ —
 * and `PEN.heavy` in `scene/types.ts` is already the 0.50 beside it.
 *
 * Those numbers are deliberately not shared with `PEN`. That one is the weights the editor
 * chooses for what it draws itself; this one is a row of a table. Today they agree, and that
 * is not a reason for one to move when the other does.
 */
export const LINE_WEIGHTS: Record<LineWeight, number> = {
    narrow: 0.13,
    wide: 0.25,
    'extra-wide': 0.5,
};

export interface LineTypeDefinition {
    id: LineType;
    name: string;
    weight: LineWeight;
    /** Sheet millimetres, on then off, repeating. `null` is a line with no gaps in it. */
    dash: number[] | null;
    /**
     * What the line is for, for a legend to print beside the mark.
     *
     * A hatch's name is its meaning — "existing masonry" is both what it is called and what it
     * says. A line type's name is only its appearance, so "Dashed, narrow" printed next to a
     * dashed line is a legend explaining nothing. The standard lists several applications for
     * most of these; this is the one a reader of a plan meets first.
     */
    use: string;
}

/*
 * One rhythm for the whole family, rather than a dash length per weight.
 *
 * ISO 128, which NBR 8403 follows, states these as multiples of the line's own width — twelve
 * of dash to three of gap — which would make one convention a different length at each of the
 * three weights, and a dash-dot narrow a visibly different mark from a dash-dot extra-wide.
 * The standard's own table draws them the other way round: one pattern, shown thicker. So the
 * multiples are taken once, at the group's larga, and every type keeps that rhythm.
 *
 * The dot is the one departure. Half a line width is 0.13 mm of ink, which no plotter and no
 * screen resolves, and a centre line whose dots cannot be seen is a dashed line. It is drawn
 * at the shortest length that still reads as a dot rather than as a dash.
 */
const GAP = 0.75;
const DASH = 3;
const LONG_DASH = 6;
const DOT = 0.4;

/** In the order the standard's table lists them: the continuous ones first, then the rest. */
export const LINE_TYPES: LineTypeDefinition[] = [
    // ── Continuous ───────────────────────────────────────────────────────────
    /*
     * Visible outlines of elements in section where no hatching is used, and limits of
     * special importance in a section. The heaviest mark on the sheet, and the one that says
     * "this is what was cut through".
     */
    {
        id: 'continuous-extra-wide',
        name: 'Continuous, extra wide',
        weight: 'extra-wide',
        dash: null,
        use: 'Cut outlines, unhatched',
    },
    /*
     * Visible outlines in section where hatching *is* used, visible edges of what is in view,
     * main contour lines, and the simplified way doors, windows and stairs are drawn. It is
     * the default because it is the commonest line on an architectural drawing, and because it
     * is what every line, rectangle, polygon and circle was already drawn as.
     */
    {
        id: 'continuous-wide',
        name: 'Continuous, wide',
        weight: 'wide',
        dash: null,
        use: 'Cut outlines and visible edges',
    },
    /*
     * Hatching, dimension lines, call-out leaders, arrows showing a direction of approach, a
     * change of level in plan, and sections revolved into the view they are taken from.
     */
    {
        id: 'continuous-narrow',
        name: 'Continuous, narrow',
        weight: 'narrow',
        dash: null,
        use: 'Dimensions, hatching, leaders',
    },

    // ── Interrupted ──────────────────────────────────────────────────────────
    /** Hidden edges and hidden outlines: what is there and cannot be seen from here. */
    {
        id: 'dashed-narrow',
        name: 'Dashed, narrow',
        weight: 'narrow',
        dash: [DASH, GAP],
        use: 'Hidden edges',
    },
    /** Centre lines, lines of symmetry, and trajectories. */
    {
        id: 'dash-dot-narrow',
        name: 'Dash-dot, narrow',
        weight: 'narrow',
        dash: [DASH, GAP, DOT, GAP],
        use: 'Centre lines and symmetry',
    },
    /*
     * The ends of a section plane and every change of direction along it. The same pattern as
     * the narrow one and four times the weight, because on a plan full of thin dash-dots the
     * cut has to be the one that is found first.
     */
    {
        id: 'dash-dot-extra-wide',
        name: 'Dash-dot, extra wide',
        weight: 'extra-wide',
        dash: [DASH, GAP, DOT, GAP],
        use: 'Section planes',
    },
    /*
     * What is beyond the cut and still belongs to the drawing: floors cantilevered overhead,
     * canopies and eaves, adjacent parts, a moving part at its limit, a detail in front of the
     * cutting plane, a centre of gravity.
     */
    {
        id: 'dash-double-dot-narrow',
        name: 'Dash-double-dot, narrow',
        weight: 'narrow',
        dash: [DASH, GAP, DOT, GAP, DOT, GAP],
        use: 'Projections overhead',
    },
    /** Axis lines, which are told from a centre line by the length of the dash. */
    {
        id: 'long-dash-dot-narrow',
        name: 'Long-dash-dot, narrow',
        weight: 'narrow',
        dash: [LONG_DASH, GAP, DOT, GAP],
        use: 'Axis lines',
    },
];

/**
 * What a shape is drawn as when it names nothing.
 *
 * Contínua larga, which is what a line, a rectangle, a polygon and a circle have always been
 * drawn as — so a drawing written before any of this existed is not restyled by it.
 */
export const DEFAULT_LINE_TYPE: LineType = 'continuous-wide';

const BY_ID = new Map(LINE_TYPES.map((type) => [type.id, type]));

export function findLineType(type: LineType): LineTypeDefinition | undefined {
    return BY_ID.get(type);
}

/**
 * For a panel: the eight, and no ninth entry meaning "none".
 *
 * A hatch offers one, because a shape with no hatch is filled the way it always was and that
 * is a real state. A line has no such state: it is drawn as one of these whether or not
 * anybody chose, and the one it is drawn as by default is _contínua larga_ — already on the
 * list. Offering "none" beside it would put the same line on the menu twice.
 */
export const LINE_TYPE_OPTIONS: { value: LineType; label: string }[] = LINE_TYPES.map((type) => ({
    value: type.id,
    label: type.name,
}));
