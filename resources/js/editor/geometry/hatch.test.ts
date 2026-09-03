import { describe, expect, it } from 'vitest';

import { clipLines, scatter, seedFrom, wander } from './hatch';
import { pointInPolygon } from './polygon';
import { point } from './vec';

/** A 1000 × 1000 square at the origin. */
const SQUARE = [[point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)]];

/** The same square with a 400 × 400 hole punched out of the middle of it. */
const HOLED = [
    SQUARE[0] ?? [],
    [point(300, 300), point(700, 300), point(700, 700), point(300, 700)],
];

describe('clipping lines to a shape', () => {
    it('fills a square with lines the spacing asked for', () => {
        const lines = clipLines(SQUARE, 0, 100, 1000);

        expect(lines).toHaveLength(10);

        for (const line of lines) {
            expect(line.a.x).toBeCloseTo(0);
            expect(line.b.x).toBeCloseTo(1000);
            expect(line.a.y).toBeCloseTo(line.b.y);
        }
    });

    it('holds every line inside the shape', () => {
        for (const line of clipLines(SQUARE, Math.PI / 4, 80, 1000)) {
            const middle = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };

            expect(pointInPolygon(SQUARE[0] ?? [], middle)).toBe(true);
        }
    });

    /*
     * The reason this takes rings rather than a polygon. A line crossing the hole leaves two
     * runs with a gap between them, which is what an even-odd fill means and what a room with
     * a column standing in it needs.
     */
    it('leaves a hole empty', () => {
        const through = clipLines(HOLED, 0, 100, 1000).filter(
            (line) => line.a.y > 350 && line.a.y < 650,
        );

        expect(through.length).toBeGreaterThan(0);

        // Two runs to a line across this band, and neither of them reaches the middle of the
        // hole: one stops at its near edge and the other starts at its far one.
        for (const line of through) {
            const spans = Math.min(line.a.x, line.b.x) < 500 && Math.max(line.a.x, line.b.x) > 500;

            expect(spans).toBe(false);
        }
    });

    /*
     * Anchored to the origin, not to each shape. Two walls side by side have to share one set
     * of lines, or the run reads as several different hatches butted up against each other.
     */
    it('lines up between two shapes that sit beside one another', () => {
        const left = clipLines(SQUARE, 0, 100, 1000);
        const right = clipLines(
            [[point(1000, 0), point(2000, 0), point(2000, 1000), point(1000, 1000)]],
            0,
            100,
            1000,
        );

        expect(left.map((line) => line.a.y)).toEqual(right.map((line) => line.a.y));
    });

    it('stops at the ceiling it was given rather than filling a site plan', () => {
        expect(clipLines(SQUARE, 0, 1, 50)).toHaveLength(50);
    });

    it('has nothing to draw in a shape with no area', () => {
        expect(clipLines([[point(0, 0), point(100, 0)]], 0, 10, 100)).toEqual([]);
        expect(clipLines(SQUARE, 0, 0, 100)).toEqual([]);
    });
});

describe('scattering a stipple', () => {
    it('keeps every speck inside the shape', () => {
        for (const speck of scatter(SQUARE, 60, 2000, 1)) {
            expect(pointInPolygon(SQUARE[0] ?? [], speck)).toBe(true);
        }
    });

    it('leaves a hole clear', () => {
        for (const speck of scatter(HOLED, 40, 4000, 7)) {
            const inHole = speck.x > 300 && speck.x < 700 && speck.y > 300 && speck.y < 700;

            expect(inHole).toBe(false);
        }
    });

    /*
     * The property the whole thing turns on. A concrete wall that speckles differently on each
     * frame shimmers as the drawing pans, and one that speckles differently in the PDF than it
     * did on screen is not the drawing that was looked at.
     */
    it('gives the same speckle every time it is asked', () => {
        expect(scatter(SQUARE, 60, 2000, 42)).toEqual(scatter(SQUARE, 60, 2000, 42));
    });

    it('gives a different one to a different element', () => {
        expect(scatter(SQUARE, 60, 2000, 1)).not.toEqual(scatter(SQUARE, 60, 2000, 2));
    });

    it('stops at the ceiling it was given', () => {
        expect(scatter(SQUARE, 1, 100, 3)).toHaveLength(100);
    });
});

describe('making a run wander', () => {
    const runs = clipLines(SQUARE, 0, 200, 100);

    it('leaves both ends exactly where the clip put them', () => {
        const veined = wander(runs, 30, 5);

        veined.forEach((points, index) => {
            const run = runs[index];

            expect(points[0]).toEqual(run?.a);
            expect(points[points.length - 1]).toEqual(run?.b);
        });
    });

    it('moves the middle, and by no more than it was allowed to', () => {
        const [vein] = wander(runs, 30, 5);
        const middles = (vein ?? []).slice(1, -1);

        expect(middles.length).toBeGreaterThan(0);

        for (const at of middles) {
            expect(Math.abs(at.y - (vein?.[0]?.y ?? 0))).toBeLessThanOrEqual(30);
        }
    });

    it('leaves a run too short to wander alone', () => {
        const short = [{ a: point(0, 0), b: point(10, 0) }];

        expect(wander(short, 30, 5)).toEqual([[point(0, 0), point(10, 0)]]);
    });

    it('wanders the same way every time', () => {
        expect(wander(runs, 30, 9)).toEqual(wander(runs, 30, 9));
    });
});

describe('the seed an element gets', () => {
    it('is the same for the same id and different for another', () => {
        expect(seedFrom('01hxyz')).toBe(seedFrom('01hxyz'));
        expect(seedFrom('01hxyz')).not.toBe(seedFrom('01hxy0'));
    });
});
