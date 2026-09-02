import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { createWall } from '@/editor/model/factories';
import { defaultLayers, emptyDocument } from '@/editor/model/document';
import { wallBandCorners, wallFaces, wallJoins, wallSides } from '@/editor/model/walls';
import { SCHEMA_VERSION, type HashiraDocument, type WallElement } from '@/editor/model/types';

const LAYER = 'layer_architecture';

/** A wall with a known id, so a test can name the band it is asking about. */
function wall(id: string, a: [number, number], b: [number, number], thickness = 200): WallElement {
    return { ...createWall(point(...a), point(...b), LAYER, thickness), id };
}

describe('wall joins', () => {
    it('leaves a wall that meets nothing square', () => {
        const only = wall('only', [0, 0], [4000, 0]);
        const band = wallJoins([only]).bands.get('only');

        expect(band).toEqual({ startLeft: 0, startRight: 0, endLeft: 4000, endRight: 4000 });
    });

    /*
     * Two walls meeting at a right angle, both 200 mm thick. The outside face of the corner
     * has to run 100 mm past the end of each centreline to meet the other, and the inside
     * face has to stop 100 mm short — which is exactly the notch a square end leaves behind.
     */
    it('mitres a right-angled corner outward on one face and back on the other', () => {
        const across = wall('across', [0, 0], [4000, 0]);
        const down = wall('down', [4000, 0], [4000, 3000]);
        const joins = wallJoins([across, down]);

        const first = joins.bands.get('across');
        const second = joins.bands.get('down');

        expect(first?.endLeft).toBeCloseTo(3900);
        expect(first?.endRight).toBeCloseTo(4100);
        // Its left is the inside of this corner, so that face pulls back and the other runs on.
        expect(second?.startLeft).toBeCloseTo(100);
        expect(second?.startRight).toBeCloseTo(-100);
    });

    it('gives a two-wall corner no patch, because the two bands already meet', () => {
        const across = wall('across', [0, 0], [4000, 0]);
        const down = wall('down', [4000, 0], [4000, 3000]);

        expect(wallJoins([across, down]).patches.size).toBe(0);
    });

    it('leaves two walls running straight on alone', () => {
        const left = wall('left', [0, 0], [2000, 0]);
        const right = wall('right', [2000, 0], [5000, 0]);
        const joins = wallJoins([left, right]);

        expect(joins.bands.get('left')?.endLeft).toBeCloseTo(2000);
        expect(joins.bands.get('left')?.endRight).toBeCloseTo(2000);
        expect(joins.bands.get('right')?.startLeft).toBeCloseTo(0);
    });

    /*
     * A T made of three wall ends at one point: the through wall is two walls in line and the
     * stem arrives between them. Each half of the through wall keeps its face flush and the
     * stem's two corners pull back to that face.
     */
    it('cleans up a T made of three ends at one point', () => {
        const left = wall('left', [0, 0], [3000, 0]);
        const right = wall('right', [3000, 0], [6000, 0]);
        const stem = wall('stem', [3000, 0], [3000, 3000]);
        const joins = wallJoins([left, right, stem]);

        expect(joins.bands.get('stem')?.startLeft).toBeCloseTo(100);
        expect(joins.bands.get('stem')?.startRight).toBeCloseTo(100);
        expect(joins.bands.get('left')?.endLeft).toBeCloseTo(2900);
        expect(joins.bands.get('right')?.startRight).toBeCloseTo(0);

        // Three bands cannot meet edge to edge, so the triangle between them is filed under
        // each of them and painted as part of the junction.
        const patch = joins.patches.get('stem')?.[0] ?? [];

        expect(patch).toHaveLength(3);
        expect(patch).toEqual(
            expect.arrayContaining([point(2900, 100), point(3100, 100), point(3000, -100)]),
        );
        expect(joins.patches.get('left')).toEqual(joins.patches.get('stem'));
    });

    /*
     * The commoner T: one wall runs past, and another stops against its side. Nothing is
     * split, so the stem is carried on to the wall it meets and the two lots of poché merge.
     */
    it('carries a branch on to the wall it stops against', () => {
        const through = wall('through', [0, 0], [6000, 0], 300);
        // Drawn to the face of the through wall rather than to its centreline.
        const branch = wall('branch', [3000, 150], [3000, 3000], 100);
        const joins = wallJoins([through, branch]);

        expect(joins.bands.get('branch')?.startLeft).toBeCloseTo(-150);
        expect(joins.bands.get('branch')?.startRight).toBeCloseTo(-150);
        expect(joins.bands.get('through')?.endLeft).toBeCloseTo(6000);
    });

    it('leaves a wall that merely passes nearby alone', () => {
        const through = wall('through', [0, 0], [6000, 0], 200);
        const apart = wall('apart', [3000, 900], [3000, 3000], 100);
        const joins = wallJoins([through, apart]);

        expect(joins.bands.get('apart')?.startLeft).toBe(0);
    });

    it('cuts a very shallow corner off rather than growing a spike', () => {
        const one = wall('one', [0, 0], [4000, 0], 200);
        const two = wall('two', [4000, 0], [0, 40], 200);
        const band = wallJoins([one, two]).bands.get('one');

        // A true mitre here runs metres past the corner; the limit is eight half-thicknesses.
        expect(band?.endRight).toBeLessThanOrEqual(4000 + 800 + 1e-6);
    });
});

describe('wall band corners', () => {
    const only = wall('only', [0, 0], [4000, 0]);

    it('squares a run that does not reach either end of the wall', () => {
        const joins = wallJoins([only]);
        const corners = wallBandCorners(only, joins.bands.get('only'), 1000, 2000);

        expect(corners).toEqual([
            point(1000, 100),
            point(2000, 100),
            point(2000, -100),
            point(1000, -100),
        ]);
    });

    it('carries the mitre only into the run that reaches the end', () => {
        const down = wall('down', [4000, 0], [4000, 3000]);
        const joins = wallJoins([only, down]);

        // The run stopping short of the corner is square; the one reaching it is not.
        expect(wallBandCorners(only, joins.bands.get('only'), 0, 3000)[1]).toEqual(
            point(3000, 100),
        );
        expect(wallBandCorners(only, joins.bands.get('only'), 3000, 4000)[1]).toEqual(
            point(3900, 100),
        );
    });
});

describe('the two sides of a wall', () => {
    /*
     * The same right-angled corner the mitre test uses. Its band is 200 mm thick, so the face
     * on the outside of the corner runs 100 mm past the end of the centreline and the one on
     * the inside stops 100 mm short — which is why a wall has three lengths and not one.
     */
    it('reads a face length off the mitre rather than off the centreline', () => {
        const across = wall('across', [0, 0], [4000, 0]);
        const down = wall('down', [4000, 0], [4000, 3000]);
        const faces = wallFaces(across, wallJoins([across, down]).bands.get('across'));

        expect(faces?.left.length).toBeCloseTo(3900);
        expect(faces?.right.length).toBeCloseTo(4100);
    });

    it('leaves both faces the length of the wall where nothing joins it', () => {
        const only = wall('only', [0, 0], [4000, 0]);
        const faces = wallFaces(only, wallJoins([only]).bands.get('only'));

        expect(faces?.left.length).toBeCloseTo(4000);
        expect(faces?.right.length).toBeCloseTo(4000);
    });

    it('points each face out of its own side of the wall', () => {
        const only = wall('only', [0, 0], [4000, 0]);
        const faces = wallFaces(only, wallJoins([only]).bands.get('only'));

        // Drawn west to east, and y grows downward: left is the southern side.
        expect(faces?.left.outward.y).toBeCloseTo(1);
        expect(faces?.right.outward.y).toBeCloseTo(-1);
    });

    /*
     * A closed square of four walls. Which face of one of them is the inside is not a question
     * that wall can answer — it is decided by the space the four of them close in.
     */
    it('calls the face a room is on the inside one', () => {
        const room = square();
        const sides = wallSides(drawingOf(room), room[0] as WallElement);

        expect(sides?.left.encloses).toBe(true);
        expect(sides?.left.label).toBe('Inside face');
        expect(sides?.right.label).toBe('Outside face');
    });

    it('will not call either face inside when the wall encloses nothing', () => {
        const alone = wall('alone', [0, 0], [4000, 0]);
        const sides = wallSides(drawingOf([alone]), alone);

        // Named by which way each one faces instead. A garden wall has no inside, and saying
        // it does would be stating something the drawing does not.
        expect(sides?.left.encloses).toBe(false);
        expect(sides?.right.encloses).toBe(false);
        expect(sides?.left.label).toBe('South face');
        expect(sides?.right.label).toBe('North face');
    });

    it('will not call either face inside when there is a room on both', () => {
        // A partition down the middle of the square: two rooms, and two insides.
        const walls = [...square(), wall('split', [2000, 0], [2000, 4000])];
        const sides = wallSides(drawingOf(walls), walls[4] as WallElement);

        expect(sides?.left.encloses).toBe(true);
        expect(sides?.right.encloses).toBe(true);
        expect(sides?.left.label).toBe('West face');
        expect(sides?.right.label).toBe('East face');
    });
});

/** Four walls closing a 4 × 4 m space, drawn clockwise from the north-west corner. */
function square(): WallElement[] {
    return [
        wall('north', [0, 0], [4000, 0]),
        wall('east', [4000, 0], [4000, 4000]),
        wall('south', [4000, 4000], [0, 4000]),
        wall('west', [0, 4000], [0, 0]),
    ];
}

/** The least document the enclosure walk needs: some walls on a visible layer. */
function drawingOf(elements: WallElement[]): HashiraDocument {
    return {
        schemaVersion: SCHEMA_VERSION,
        id: 'doc',
        name: 'Test',
        settings: emptyDocument('Test').settings,
        layers: defaultLayers(),
        elements,
    };
}
