/**
 * The mark, as geometry.
 *
 * An H whose crossbar is folded, and whose fold shears the letter apart — the foot of one stem
 * and the head of the other are cut loose along it. The coordinates are the icon's own,
 * measured off `public/`'s 512 px artwork and kept, which is what stops the drawn mark and the
 * shipped icons from drifting apart.
 *
 * It lives here, in plain TypeScript with nothing imported, because two very different things
 * draw it: `ui/Logo.tsx` puts it in the interface as SVG, and the PDF exporter puts it in the
 * corner of a printed sheet. A second copy of these numbers is a second mark, and the one that
 * gets corrected is never the one somebody is looking at.
 */

/** The part of the icon's canvas the letter actually occupies. */
export const MARK_BOX = { x: 128, y: 104, width: 256, height: 304 };

export const MARK_ASPECT = MARK_BOX.width / MARK_BOX.height;

/** Closed outlines, in the icon's own coordinates. Straight lines throughout — it is a letter. */
const SHAPES: readonly (readonly (readonly [number, number])[])[] = [
    [
        [128, 104],
        [195, 104],
        [195, 219.4],
        [256, 195],
        [384, 246.2],
        [384, 408],
        [318, 408],
        [318, 289.8],
        [256, 265],
        [128, 316.2],
    ],
    [
        [128, 333.2],
        [195, 306.4],
        [195, 408],
        [128, 408],
    ],
    [
        [318, 104],
        [384, 104],
        [384, 229.2],
        [318, 202.8],
    ],
];

/**
 * Where a drawn mark goes: the top-left corner it hangs from and how tall it is, in whatever
 * units the caller is drawing in. Width follows from the aspect, because a squashed letter is
 * a different letter.
 */
export interface MarkPlacement {
    x: number;
    y: number;
    height: number;
}

/**
 * The mark as SVG path data, one string per outline.
 *
 * Given no placement it comes back in the icon's own coordinates, which is what `MARK_BOX`
 * describes and what the interface's viewBox is cropped to.
 */
export function markPaths(placement?: MarkPlacement): string[] {
    const scale = placement === undefined ? 1 : placement.height / MARK_BOX.height;
    const originX = placement === undefined ? MARK_BOX.x : placement.x;
    const originY = placement === undefined ? MARK_BOX.y : placement.y;

    return SHAPES.map((shape) =>
        shape
            .map(([x, y], index) => {
                const at = `${round(originX + (x - MARK_BOX.x) * scale)} ${round(originY + (y - MARK_BOX.y) * scale)}`;

                return index === 0 ? `M ${at}` : `L ${at}`;
            })
            .join(' ')
            .concat(' Z'),
    );
}

/** Path data is text, and 15 decimal places of it is a bigger file saying the same thing. */
function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}
