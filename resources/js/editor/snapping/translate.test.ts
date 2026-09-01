import { describe, expect, it } from 'vitest';

import { add, point, type Point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { elementWorldPoints, translateElement } from '@/editor/model/elements';
import { createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument, SnapSettings } from '@/editor/model/types';
import { wallJoins } from '@/editor/model/walls';

import { snapPoint, type SnapOptions, type SnapResult } from './engine';
import { snapTranslation } from './translate';

const LAYER = 'layer_architecture';

const ALL_ON: SnapSettings = {
    enabled: true,
    endpoint: true,
    midpoint: true,
    intersection: true,
    axis: true,
};

function drawingWith(elements: Element[]): HashiraDocument {
    return {
        schemaVersion: 1,
        id: 'doc',
        name: 'Test',
        settings: {
            unit: 'm',
            scale: 50,
            grid: { size: 100, subdivisions: 2, visible: true, snap: true },
            snapping: ALL_ON,
            sheets: [
                {
                    id: 'sheet_1',
                    name: 'Sheet 1',
                    size: 'A3',
                    orientation: 'landscape',
                    scale: 50,
                    centre: null,
                },
            ],
            title: 'Test',
            titleBlock: { project: '', client: '', drawnBy: '', revision: '', date: '' },
            notes: '',
        },
        layers: defaultLayers(),
        elements,
    };
}

/** The snapper the select tool hands over, with the dragged element left out of its own hunt. */
function snapperFor(elements: Element[], exclude: ReadonlySet<string>) {
    const options: SnapOptions = {
        drawing: drawingWith(elements),
        settings: ALL_ON,
        gridSnapEnabled: false,
        gridSize: 100,
        tolerance: 60,
        exclude,
    };

    return (at: Point) => snapPoint(at, options);
}

/** A snapper that answers with fixed points, for the ranking tests. */
function fixed(answers: { near: Point; result: SnapResult }[]) {
    return (at: Point): SnapResult => {
        const found = answers.find(
            (answer) => Math.abs(answer.near.x - at.x) < 1 && Math.abs(answer.near.y - at.y) < 1,
        );

        return found?.result ?? { point: at, kind: null };
    };
}

describe('snapping a move by what is being moved', () => {
    it('leaves the translation alone when nothing catches', () => {
        const delta = point(300, -200);
        const moved = snapTranslation([point(0, 0), point(1000, 0)], delta, (at) => ({
            point: at,
            kind: null,
        }));

        expect(moved.delta).toEqual(delta);
        expect(moved.result).toBeNull();
    });

    /*
     * The whole point of measuring this on the geometry: the correction belongs to whichever
     * point landed on something, and the rest of the selection comes along with it.
     */
    it('corrects the translation by the point that landed', () => {
        const snap = fixed([
            { near: point(1040, 0), result: { point: point(1000, 0), kind: 'endpoint' } },
        ]);

        const moved = snapTranslation([point(0, 0), point(1000, 0)], point(40, 0), snap);

        expect(moved.delta).toEqual(point(0, 0));
        expect(moved.result?.kind).toBe('endpoint');
    });

    it('lets an endpoint beat a grid line, however much nearer the grid line is', () => {
        const snap = fixed([
            { near: point(50, 0), result: { point: point(45, 0), kind: 'grid' } },
            { near: point(1050, 0), result: { point: point(1000, 0), kind: 'endpoint' } },
        ]);

        const moved = snapTranslation([point(0, 0), point(1000, 0)], point(50, 0), snap);

        expect(moved.result?.kind).toBe('endpoint');
        expect(moved.delta).toEqual(point(0, 0));
    });

    it('takes the shorter correction between two of the same kind', () => {
        const snap = fixed([
            { near: point(50, 0), result: { point: point(0, 0), kind: 'endpoint' } },
            { near: point(1050, 0), result: { point: point(1040, 0), kind: 'endpoint' } },
        ]);

        const moved = snapTranslation([point(0, 0), point(1000, 0)], point(50, 0), snap);

        expect(moved.delta).toEqual(point(40, 0));
    });
});

/*
 * The reason any of this exists. A wall dragged up against another one used to stop wherever
 * the pointer's own snap put it, which is millimetres out — and walls whose ends are more than
 * a millimetre apart are two walls, so their bands stay square and overlap at the corner
 * instead of mitring into it.
 */
describe('a wall dragged onto the end of another', () => {
    const standing = createWall(point(4000, 0), point(4000, 4000), LAYER, 200);

    /** Where the band's corners sit, as distances along the centreline. */
    function bandOf(walls: Element[], id: string) {
        return wallJoins(walls).bands.get(id);
    }

    it('lands on its corner exactly, and the two mitre', () => {
        // Drawn 40 mm short and 25 mm low: near enough to look joined, far enough not to be.
        const loose = createWall(point(0, -25), point(3960, -25), LAYER, 200);
        const snap = snapperFor([standing, loose], new Set([loose.id]));

        expect(bandOf([standing, loose], loose.id)?.endLeft).toBe(3960);

        const moved = snapTranslation(
            elementWorldPoints(loose, () => undefined),
            point(0, 0),
            snap,
        );

        expect(moved.result?.kind).toBe('endpoint');

        const joined = translateElement(loose, moved.delta, () => undefined);
        const band = bandOf([standing, joined], joined.id);

        // Mitred: the band's two corners at that end no longer sit at the same distance along
        // the wall, which is what a square end looks like.
        expect(band?.endLeft).not.toBe(band?.endRight);
    });

    it('brings the wall to the corner rather than to the pointer', () => {
        const loose = createWall(point(0, -25), point(3960, -25), LAYER, 200);
        const snap = snapperFor([standing, loose], new Set([loose.id]));

        const moved = snapTranslation(
            elementWorldPoints(loose, () => undefined),
            point(0, 0),
            snap,
        );

        const end = add(point(3960, -25), moved.delta);

        expect(end.x).toBeCloseTo(4000);
        expect(end.y).toBeCloseTo(0);
    });
});
