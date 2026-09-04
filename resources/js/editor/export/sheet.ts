import type { KeyEntry } from '@/editor/model/conventions';
import { boundsHeight, boundsWidth, expandBounds, type Bounds } from '@/editor/geometry/bbox';
import type { Sheet, SheetOrientation, SheetSize } from '@/editor/model/types';

/**
 * Putting a drawing on a page.
 *
 * A drawing has a scale, and a scale is a promise: 1:50 means a metre on the wall is 20 mm on
 * the paper, and someone can hold a ruler to the print. So the scale is never quietly adjusted
 * to make things fit — it is stepped to the next standard ratio that does, and the title block
 * says which one was used.
 *
 * A sheet either frames the whole drawing or looks at one place in it, and the difference runs
 * the arithmetic backwards. Framing the drawing, the extent is known and the scale is what has
 * to give. Looking at a place, the scale is a decision somebody made and the frame is a
 * physical size, so the extent is whatever fits — the drawing may well run off the page, which
 * is the point of putting a plan across several of them.
 *
 * This is also what the canvas draws when the sheet outline is shown, so the page on screen
 * and the page that prints are laid out by the same function rather than by two that agree
 * until one of them is changed.
 */

/** ISO A sizes in portrait, in millimetres. */
const SIZES: Record<SheetSize, { width: number; height: number }> = {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    A2: { width: 420, height: 594 },
    A1: { width: 594, height: 841 },
};

/** The scales a drawing is actually plotted at, and the only ones a sheet can be set to. */
export const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];

export const SHEET_MARGIN_MM = 12;

/**
 * The band along the bottom of the page, in millimetres of paper.
 *
 * Deep enough for a title block that is a stamp rather than a caption: two rows of labelled
 * facts, the drawing's name at a size that carries across a room, and a scale bar under it.
 * The layout uses it to decide where the drawing stops, so the page on screen loses exactly
 * the same strip the print does.
 */
export const TITLE_BLOCK_HEIGHT_MM = 26;

/** What a millimetre of paper is worth in the unit a PDF measures in. */
export const PT_PER_MM = 72 / 25.4;

/**
 * The strip down the right-hand side, when the sheet has one.
 *
 * Wide enough to set a line of notes in and narrow enough that it is plainly not the drawing.
 * It comes out of the drawing area, which is the point: a sheet is a fixed amount of paper, so
 * a strip of notes is paid for in millimetres of plan, and the scale steps back if the plan no
 * longer fits. Working that out anywhere but here would let the page on screen and the page
 * that prints disagree about how much room the drawing has.
 */
function asideWidth(frameWidth: number): number {
    return Math.min(Math.max(frameWidth * 0.17, 42), 64);
}

/**
 * Air around a drawing that is framed rather than placed, in millimetres of paper.
 *
 * A plan touching the frame edge reads as clipped even when it is not. This lives here rather
 * than in the exporter so that each sheet gets it in its own scale, and so that the outline on
 * screen is the page that prints: two places padding a drawing is two places to disagree.
 */
const FRAMED_MARGIN_MM = 4;

export interface SheetLayout {
    /** Page size in millimetres. */
    page: { width: number; height: number };
    /** Everything inside the margins: the drawing, the strip beside it, the block under it. */
    box: { x: number; y: number; width: number; height: number };
    /** The area the drawing occupies, in page millimetres. */
    frame: { x: number; y: number; width: number; height: number };
    /** The strip beside the drawing, when this sheet was laid out with one. */
    aside: { x: number; y: number; width: number; height: number } | null;
    /** The scale actually used — the requested one, or the next standard one that fits. */
    scale: number;
    /** Whether the drawing had to be stepped back to fit. */
    rescaled: boolean;
    /** Page millimetres per world millimetre. */
    unitsPerWorldMm: number;
    /** World point that lands at the frame's top-left corner. */
    origin: { x: number; y: number };
}

export function pageSize(
    size: SheetSize,
    orientation: SheetOrientation,
): { width: number; height: number } {
    const portrait = SIZES[size];

    return orientation === 'landscape'
        ? { width: portrait.height, height: portrait.width }
        : portrait;
}

export function layoutSheet(bounds: Bounds, sheet: Sheet, aside = false): SheetLayout {
    const page = pageSize(sheet.size, sheet.orientation);

    const box = {
        x: SHEET_MARGIN_MM,
        y: SHEET_MARGIN_MM,
        width: page.width - SHEET_MARGIN_MM * 2,
        height: page.height - SHEET_MARGIN_MM * 2,
    };

    const strip = aside ? asideWidth(box.width) : 0;

    const frame = {
        x: box.x,
        y: box.y,
        width: box.width - strip,
        height: box.height - TITLE_BLOCK_HEIGHT_MM,
    };

    const beside =
        strip === 0
            ? null
            : { x: frame.x + frame.width, y: frame.y, width: strip, height: frame.height };

    if (sheet.centre !== null) {
        // A window onto the drawing: the scale is the one that was asked for, and the frame
        // shows the piece of the drawing that fits around the point it is looking at.
        const unitsPerWorldMm = 1 / sheet.scale;

        return {
            page,
            box,
            frame,
            aside: beside,
            scale: sheet.scale,
            rescaled: false,
            unitsPerWorldMm,
            origin: {
                x: sheet.centre.x - frame.width / 2 / unitsPerWorldMm,
                y: sheet.centre.y - frame.height / 2 / unitsPerWorldMm,
            },
        };
    }

    // Padded at the scale that was asked for rather than the one this arrives at, which would
    // be circular: the padding is what decides whether the drawing still fits.
    const padded = expandBounds(bounds, Math.max(sheet.scale * FRAMED_MARGIN_MM, 100));
    const worldWidth = Math.max(boundsWidth(padded), 1);
    const worldHeight = Math.max(boundsHeight(padded), 1);

    // The smallest denominator that still fits the drawing inside the frame.
    const needed = Math.max(worldWidth / frame.width, worldHeight / frame.height);
    const scale = nextStandardScale(Math.max(sheet.scale, needed));

    const unitsPerWorldMm = 1 / scale;
    const drawnWidth = worldWidth * unitsPerWorldMm;
    const drawnHeight = worldHeight * unitsPerWorldMm;

    return {
        page,
        box,
        frame,
        aside: beside,
        scale,
        rescaled: scale !== sheet.scale,
        unitsPerWorldMm,
        origin: {
            x: padded.minX - (frame.width - drawnWidth) / 2 / unitsPerWorldMm,
            y: padded.minY - (frame.height - drawnHeight) / 2 / unitsPerWorldMm,
        },
    };
}

/**
 * Where a laid-out sheet lands on the drawing, in world millimetres: the frame it shows, and
 * the paper around that. What the canvas needs to draw the page, and the only place the two
 * rectangles are worked out.
 */
export function sheetInWorld(layout: SheetLayout): { page: Bounds; frame: Bounds } {
    const { scale, frame, origin } = layout;

    const drawn: Bounds = {
        minX: origin.x,
        minY: origin.y,
        maxX: origin.x + frame.width * scale,
        maxY: origin.y + frame.height * scale,
    };

    return {
        frame: drawn,
        page: {
            minX: drawn.minX - frame.x * scale,
            minY: drawn.minY - frame.y * scale,
            maxX: drawn.minX - frame.x * scale + layout.page.width * scale,
            maxY: drawn.minY - frame.y * scale + layout.page.height * scale,
        },
    };
}

/** A layer as the legend beside a drawing lists it. */
export interface LegendEntry {
    name: string;
    color: string;
}

/** What the strip beside the drawing carries. */
export interface SheetAside {
    /** One note to a line, in the order they were written. */
    notes: string[];
    legend: LegendEntry[];
    /** The hatches and line types this page uses, as one list. */
    key: KeyEntry[];
}

/**
 * What goes in the strip, and so whether the sheet has one at all.
 *
 * A strip is paid for out of the drawing, so it is only worth reserving when something would
 * be printed in it: notes somebody wrote, a legend that says something — and a legend of one
 * layer says nothing a reader could not see by looking at the drawing — or a key, which says
 * something the moment there is a single convention on the sheet to decode.
 *
 * One convention earns a key where one layer does not earn a legend, and the difference is not
 * an inconsistency. A layer is a name the drafter chose and can read off the panel; a hatch is
 * a mark on the paper that means nothing at all to a reader who has not been told what it is.
 *
 * The canvas and the exporter both ask this, because a sheet outline that reserves a strip the
 * print does not is an outline that lies about what fits.
 */
export function sheetAside(
    notes: string,
    layers: readonly LegendEntry[],
    conventions: readonly KeyEntry[] = [],
): SheetAside | null {
    const written = notes
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');

    const legend = layers.length > 1 ? [...layers] : [];
    const key = [...conventions];

    return written.length === 0 && legend.length === 0 && key.length === 0
        ? null
        : { notes: written, legend, key };
}

/** Round up to a scale a drafter would recognise, so the printed ratio is a real one. */
export function nextStandardScale(value: number): number {
    return STANDARD_SCALES.find((candidate) => candidate >= value - 1e-9) ?? Math.ceil(value);
}

/**
 * A scale bar the length of a round number of metres — the check a reader can actually
 * perform on a print, since a stated ratio is worthless if the page was resized on the way.
 */
export function scaleBarMetres(scale: number, maxLengthMm: number): number {
    for (const metres of [10, 5, 2, 1]) {
        if ((metres * 1000) / scale <= maxLengthMm) {
            return metres;
        }
    }

    return 1;
}
