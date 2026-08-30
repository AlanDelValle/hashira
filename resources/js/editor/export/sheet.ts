import { boundsHeight, boundsWidth, type Bounds } from '@/editor/geometry/bbox';
import type { SheetOrientation, SheetSize } from '@/editor/model/types';

/**
 * Putting a drawing on a page.
 *
 * A drawing has a scale, and a scale is a promise: 1:50 means a metre on the wall is 20 mm on
 * the paper, and someone can hold a ruler to the print. So the scale is never quietly adjusted
 * to make things fit — it is stepped to the next standard ratio that does, and the title block
 * says which one was used.
 */

/** ISO A sizes in portrait, in millimetres. */
const SIZES: Record<SheetSize, { width: number; height: number }> = {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    A2: { width: 420, height: 594 },
    A1: { width: 594, height: 841 },
};

/** The scales a drawing is actually plotted at. */
const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];

export const SHEET_MARGIN_MM = 12;
export const TITLE_BLOCK_HEIGHT_MM = 20;

export interface SheetLayout {
    /** Page size in millimetres. */
    page: { width: number; height: number };
    /** The area the drawing occupies, in page millimetres. */
    frame: { x: number; y: number; width: number; height: number };
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

export function layoutSheet(
    bounds: Bounds,
    size: SheetSize,
    orientation: SheetOrientation,
    requestedScale: number,
): SheetLayout {
    const page = pageSize(size, orientation);

    const frame = {
        x: SHEET_MARGIN_MM,
        y: SHEET_MARGIN_MM,
        width: page.width - SHEET_MARGIN_MM * 2,
        height: page.height - SHEET_MARGIN_MM * 2 - TITLE_BLOCK_HEIGHT_MM,
    };

    const worldWidth = Math.max(boundsWidth(bounds), 1);
    const worldHeight = Math.max(boundsHeight(bounds), 1);

    // The smallest denominator that still fits the drawing inside the frame.
    const needed = Math.max(worldWidth / frame.width, worldHeight / frame.height);
    const scale = nextStandardScale(Math.max(requestedScale, needed));

    const unitsPerWorldMm = 1 / scale;
    const drawnWidth = worldWidth * unitsPerWorldMm;
    const drawnHeight = worldHeight * unitsPerWorldMm;

    return {
        page,
        frame,
        scale,
        rescaled: scale !== requestedScale,
        unitsPerWorldMm,
        origin: {
            x: bounds.minX - (frame.width - drawnWidth) / 2 / unitsPerWorldMm,
            y: bounds.minY - (frame.height - drawnHeight) / 2 / unitsPerWorldMm,
        },
    };
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
