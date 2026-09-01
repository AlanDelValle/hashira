import { describe, expect, it } from 'vitest';

import { MARK_ASPECT, MARK_BOX, markPaths } from './mark';

/** Every point in a set of paths, as pairs. */
function points(paths: readonly string[]): { x: number; y: number }[] {
    return paths.flatMap((path) => {
        const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

        return numbers
            .filter((_, index) => index % 2 === 0)
            .map((x, index) => ({ x, y: numbers[index * 2 + 1] ?? 0 }));
    });
}

describe('the mark', () => {
    /*
     * The interface draws this and so does the PDF exporter, from these numbers, which were
     * measured off the 512 px artwork in `public/`. If they are ever edited to suit one of the
     * two, the icons stop being the same letter — so the coordinates are pinned here rather
     * than left to whichever caller happens to be looked at.
     */
    it("comes back in the icon's own coordinates when it is not placed", () => {
        const paths = markPaths();

        expect(paths).toHaveLength(3);
        expect(paths[0]?.startsWith('M 128 104 L 195 104')).toBe(true);
        expect(paths.every((path) => path.endsWith(' Z'))).toBe(true);

        const drawn = points(paths);

        expect(Math.min(...drawn.map((point) => point.x))).toBe(MARK_BOX.x);
        expect(Math.max(...drawn.map((point) => point.y))).toBe(MARK_BOX.y + MARK_BOX.height);
    });

    /** A letter set to a height, at the corner it was given. Squashing it makes it another letter. */
    it('hangs from the corner it is placed at, at the size it was asked for', () => {
        const drawn = points(markPaths({ x: 10, y: 20, height: 152 }));

        const left = Math.min(...drawn.map((point) => point.x));
        const right = Math.max(...drawn.map((point) => point.x));
        const top = Math.min(...drawn.map((point) => point.y));
        const bottom = Math.max(...drawn.map((point) => point.y));

        expect(left).toBeCloseTo(10);
        expect(top).toBeCloseTo(20);
        expect(bottom - top).toBeCloseTo(152);
        expect(right - left).toBeCloseTo(152 * MARK_ASPECT);
    });
});
