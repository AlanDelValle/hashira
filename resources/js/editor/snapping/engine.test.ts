import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { createLine, createRect, createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument, SnapSettings } from '@/editor/model/types';

import { snapPoint, type SnapOptions } from './engine';

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

function options(elements: Element[], overrides: Partial<SnapOptions> = {}): SnapOptions {
    return {
        drawing: drawingWith(elements),
        settings: ALL_ON,
        gridSnapEnabled: true,
        gridSize: 100,
        tolerance: 60,
        ...overrides,
    };
}

describe('the snap engine', () => {
    const wall = createWall(point(0, 0), point(4000, 0), LAYER, 150);

    it('returns the raw point when snapping is switched off', () => {
        const raw = point(1234, 567);
        const result = snapPoint(raw, options([wall], { settings: { ...ALL_ON, enabled: false } }));

        expect(result.point).toEqual(raw);
        expect(result.kind).toBeNull();
    });

    it('lands on an endpoint in preference to the grid', () => {
        // 4020,30 is 30 mm from the wall's end and also near the 4000,0 grid intersection.
        const result = snapPoint(point(4020, 30), options([wall]));

        expect(result.kind).toBe('endpoint');
        expect(result.point).toEqual({ x: 4000, y: 0 });
    });

    it('lands on a midpoint', () => {
        const result = snapPoint(point(2010, 20), options([wall]));

        expect(result.kind).toBe('midpoint');
        expect(result.point.x).toBeCloseTo(2000);
        expect(result.point.y).toBeCloseTo(0);
    });

    it('prefers an endpoint over a midpoint when both are in range', () => {
        const short = createWall(point(0, 0), point(100, 0), LAYER, 150);
        const result = snapPoint(point(48, 5), options([short], { tolerance: 60 }));

        expect(result.kind).toBe('endpoint');
    });

    it('finds where two walls cross', () => {
        // Both walls are placed so that neither's midpoint lands on the crossing: a crossing
        // that coincides with a midpoint is reported as the midpoint, which is the same point
        // anyway, and would make this test prove nothing.
        const across = createWall(point(1500, -200), point(1500, 1000), LAYER, 150);
        const result = snapPoint(point(1520, 20), options([wall, across], { tolerance: 40 }));

        expect(result.kind).toBe('intersection');
        expect(result.point.x).toBeCloseTo(1500);
        expect(result.point.y).toBeCloseTo(0);
    });

    it('holds an alignment with a point the tool has already placed', () => {
        const anchor = point(1234, 0);
        const result = snapPoint(
            point(1250, 3000),
            options([], { anchors: [anchor], gridSnapEnabled: false, tolerance: 60 }),
        );

        expect(result.kind).toBe('vertical');
        expect(result.point.x).toBe(anchor.x);
        // Only the aligned coordinate is locked; the other stays where the pointer was.
        expect(result.point.y).toBe(3000);
        expect(result.reference).toEqual(anchor);
    });

    /*
     * Reported from the editor: with the wall tool and snap on, dragging diagonally landed on
     * the grid and dragging along a straight line did not. The alignment was winning — as it
     * should — and taking the free coordinate with it, leaving the wall a fraction of a grid
     * step long in the one direction anybody would expect to be exact.
     */
    it('still lands on the grid in the direction an alignment leaves free', () => {
        const anchor = point(0, 0);
        const result = snapPoint(
            point(1234, 20),
            options([], { anchors: [anchor], tolerance: 60 }),
        );

        expect(result.kind).toBe('horizontal');
        expect(result.point.y).toBe(0);
        expect(result.point.x).toBe(1200);
    });

    it('does the same holding a vertical', () => {
        const result = snapPoint(
            point(20, 1234),
            options([], { anchors: [point(0, 0)], tolerance: 60 }),
        );

        expect(result.kind).toBe('vertical');
        expect(result.point).toEqual({ x: 0, y: 1200 });
    });

    it('leaves the free coordinate where the pointer put it when the grid is off', () => {
        const result = snapPoint(
            point(1234, 20),
            options([], { anchors: [point(0, 0)], gridSnapEnabled: false, tolerance: 60 }),
        );

        expect(result.point).toEqual({ x: 1234, y: 0 });
    });

    /*
     * Reported from the editor: choosing the wall tool and clicking gave no way to line the
     * first point up with anything, because guides ran only from points the tool had already
     * placed — and for a first point there are none. Drawing a wall parallel to one across
     * the room is exactly what an alignment is for.
     */
    it('lines up with a corner across the room, not only with what is under the pointer', () => {
        const across = createWall(point(6000, 200), point(6000, 3000), LAYER, 150);
        const result = snapPoint(
            point(5980, 30),
            options([across], {
                tolerance: 60,
                gridSnapEnabled: false,
                visible: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
            }),
        );

        expect(result.kind).toBe('vertical');
        expect(result.point.x).toBe(6000);
        expect(result.reference).toEqual({ x: 6000, y: 200 });
    });

    /*
     * Found by drawing a line in what looked like empty sheet and getting a length that was
     * not a whole number of grid steps: a chest of drawers across the room had a row through
     * it, and the guide took the coordinate. A plan with furniture in it has a row and a
     * column through every edge of every block, so a hint has to beat the grid on distance
     * before it beats it on priority.
     */
    it('will not take a coordinate the grid was closer to', () => {
        // The block's edge is at y = 3625; the pointer is 17 mm from the grid row at 3700 and
        // 58 mm from the edge, so the grid has it.
        const block = createRect(point(2000, 3625), point(3000, 3925), LAYER);
        const result = snapPoint(
            point(5000, 3683),
            options([block], {
                tolerance: 66,
                visible: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
            }),
        );

        expect(result.kind).toBe('grid');
        expect(result.point.y).toBe(3700);
    });

    it('takes it when the pointer really is nearer the guide than the grid', () => {
        const block = createRect(point(2000, 3625), point(3000, 3925), LAYER);
        const result = snapPoint(
            point(5000, 3630),
            options([block], {
                tolerance: 66,
                visible: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
            }),
        );

        expect(result.kind).toBe('horizontal');
        expect(result.point.y).toBe(3625);
    });

    /*
     * With the grid off there is nothing for a guide to be nearer than, so it applies across
     * its whole tolerance — and the coordinate it does not lock stays exactly where the
     * pointer put it.
     */
    it('lets a guide hold the line on its own when the grid is off', () => {
        const block = createRect(point(2000, 3625), point(3000, 3925), LAYER);
        const result = snapPoint(
            point(5000, 3683),
            options([block], {
                tolerance: 66,
                gridSnapEnabled: false,
                visible: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
            }),
        );

        expect(result.kind).toBe('horizontal');
        expect(result.point).toEqual({ x: 5000, y: 3625 });
    });

    /*
     * A point the tool placed is different: holding a wall horizontal from the corner it
     * starts at is the strongest intent there is, and losing it to a grid row a few
     * millimetres nearer would leave the wall not horizontal.
     */
    it('holds an anchor’s line however near a grid row is', () => {
        const result = snapPoint(
            point(1234, 3649),
            options([], { anchors: [point(0, 3625)], tolerance: 60 }),
        );

        expect(result.kind).toBe('horizontal');
        expect(result.point).toEqual({ x: 1200, y: 3625 });
    });

    it('does not reach for a guide to something off screen', () => {
        const across = createWall(point(6000, 200), point(6000, 3000), LAYER, 150);
        const result = snapPoint(
            point(5980, 30),
            options([across], {
                tolerance: 60,
                gridSnapEnabled: false,
                // The wall is below the bottom of what is on screen.
                visible: { minX: 0, minY: -1000, maxX: 10000, maxY: 100 },
            }),
        );

        expect(result.kind).toBeNull();
    });

    it('falls back to the grid when nothing else is near', () => {
        const result = snapPoint(point(1234, 5678), options([]));

        expect(result.kind).toBe('grid');
        expect(result.point).toEqual({ x: 1200, y: 5700 });
    });

    it('never leaves a dead zone: the grid always offers a candidate', () => {
        // Half a grid cell from any line, so the grid is far away but must still win.
        const result = snapPoint(point(1250, 1250), options([], { tolerance: 10 }));

        expect(result.kind).toBe('grid');
    });

    it('leaves the point alone when the grid is off and nothing is near', () => {
        const raw = point(1234, 5678);
        const result = snapPoint(raw, options([], { gridSnapEnabled: false }));

        expect(result.kind).toBeNull();
        expect(result.point).toEqual(raw);
    });

    it('ignores an element it was told to exclude', () => {
        const result = snapPoint(
            point(4020, 30),
            options([wall], { exclude: new Set([wall.id]), gridSnapEnabled: false }),
        );

        expect(result.kind).not.toBe('endpoint');
    });

    it('ignores elements on a hidden layer', () => {
        const drawing = drawingWith([wall]);
        const hidden = {
            ...drawing,
            layers: drawing.layers.map((layer) =>
                layer.id === LAYER ? { ...layer, visible: false } : layer,
            ),
        };

        const result = snapPoint(point(4020, 30), {
            ...options([wall], { gridSnapEnabled: false }),
            drawing: hidden,
        });

        expect(result.kind).toBeNull();
    });

    it('honours each snap type being turned off individually', () => {
        const withoutEndpoints = snapPoint(
            point(4020, 30),
            options([wall], {
                settings: { ...ALL_ON, endpoint: false, axis: false, intersection: false },
                gridSnapEnabled: false,
            }),
        );

        expect(withoutEndpoints.kind).toBeNull();
    });

    it('snaps to the end of a line as readily as a wall', () => {
        const line = createLine(point(500, 500), point(900, 500), LAYER);
        const result = snapPoint(point(910, 495), options([line], { tolerance: 30 }));

        expect(result.kind).toBe('endpoint');
        expect(result.point.x).toBeCloseTo(900);
    });
});

/*
 * Dimensioning to a face is what a drafter does, and until the faces were offered here the
 * only thing a wall put forward was the centreline it was drawn from — a line that is not on
 * the wall at all, and is not what anybody measures on site.
 */
describe('snapping to a wall face', () => {
    const wall = { ...createWall(point(0, 0), point(4000, 0), LAYER, 200), id: 'wall' };

    it('catches the corner where a face begins', () => {
        const result = snapPoint(point(12, 88), options([wall]));

        expect(result.kind).toBe('endpoint');
        expect(result.point).toEqual(point(0, 100));
    });

    it('catches the middle of a face', () => {
        const result = snapPoint(point(2020, 88), options([wall]));

        expect(result.kind).toBe('midpoint');
        expect(result.point).toEqual(point(2000, 100));
    });

    /*
     * Neither face ends where the centreline does once a corner is mitred: the one on the
     * inside stops 100 mm short of it and the one on the outside runs 100 mm past. Both of
     * those are points on the building, and x = 4000 — where the wall was drawn to — is a
     * point on neither face.
     */
    it('offers the mitred face rather than an offset of the centreline', () => {
        const down = { ...createWall(point(4000, 0), point(4000, 3000), LAYER, 200), id: 'down' };

        const inside = snapPoint(point(3880, 88), options([wall, down]));

        expect(inside.kind).toBe('endpoint');
        expect(inside.point).toEqual(point(3900, 100));

        const outside = snapPoint(point(4080, -88), options([wall, down]));

        expect(outside.kind).toBe('endpoint');
        expect(outside.point).toEqual(point(4100, -100));
    });

    it('still offers the centreline, which is what a wall is set out from', () => {
        const result = snapPoint(point(18, 12), options([wall]));

        expect(result.kind).toBe('endpoint');
        expect(result.point).toEqual(point(0, 0));
    });
});
