import { add, distance, subtract, type Point } from '@/editor/geometry/vec';

import { snapStrength, type SnapResult } from './engine';

/**
 * Snapping a move by what is being moved, rather than by the pointer.
 *
 * A pointer snap answers "where is the cursor?", which is the right question while a tool is
 * placing a point and the wrong one while something is being dragged: what has to land exactly
 * is the corner of the thing in hand, and the cursor is wherever it was grabbed. Left to the
 * pointer, a wall dragged up to another one stops a few millimetres out — close enough to look
 * joined at any sensible zoom, far enough that the two are still two, so their bands overlap
 * instead of mitring and the room they enclose is not the room it looks like.
 *
 * So every point of the dragged selection is offered to the snapper, and the one that lands on
 * something pulls the whole selection with it. What comes back is a correction to the delta,
 * which is why this deals in translations rather than points.
 */

export interface TranslationSnap {
    /** The translation to apply, corrected by whichever point of the selection caught. */
    delta: Point;
    /** What caught it, for the indicator to say why the drag stopped where it did. */
    result: SnapResult | null;
}

export function snapTranslation(
    points: readonly Point[],
    delta: Point,
    snap: (at: Point) => SnapResult,
): TranslationSnap {
    let best: { result: SnapResult; correction: Point; strength: number; travel: number } | null =
        null;

    for (const point of points) {
        const moved = add(point, delta);
        const result = snap(moved);

        if (result.kind === null) {
            continue;
        }

        const strength = snapStrength(result.kind);
        const travel = distance(moved, result.point);

        // The strongest kind wins — an endpoint means more than a grid line, wherever the
        // pointer happens to be — and between two of the same kind, the shorter correction.
        // Anything else would let a far-off corner of the selection drag it across the sheet.
        if (
            best === null ||
            strength < best.strength ||
            (strength === best.strength && travel < best.travel)
        ) {
            best = { result, correction: subtract(result.point, moved), strength, travel };
        }
    }

    return best === null
        ? { delta, result: null }
        : { delta: add(delta, best.correction), result: best.result };
}
