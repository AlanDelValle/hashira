import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { distance, point } from '@/editor/geometry/vec';

import { elementWorldPoints, makeLookup } from './elements';
import {
    segmentAngle,
    setLineType,
    setPosition,
    setSegmentAngle,
    setSegmentLength,
    setWallThickness,
} from './edits';
import { createLine, createWall } from './factories';
import { defaultLayers } from './document';
import type { HashiraDocument } from './types';

const LAYER = 'layer_architecture';

const emptyDrawing: HashiraDocument = {
    schemaVersion: 1,
    id: 'doc',
    name: 'Test',
    settings: {
        unit: 'm',
        scale: 50,
        grid: { size: 100, subdivisions: 2, visible: true, snap: true },
        snapping: { enabled: true, endpoint: true, midpoint: true, intersection: true, axis: true },
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
    elements: [],
};

const lookup = makeLookup(emptyDrawing.elements);

describe('editing by value', () => {
    it('lengthens a wall from its far end, leaving the near end where it was', () => {
        const wall = createWall(point(1000, 500), point(3000, 500), LAYER);
        const [beforeA] = elementWorldPoints(wall, lookup);

        const longer = setSegmentLength(wall, 4000);
        const [afterA, afterB] = elementWorldPoints(longer, lookup);

        expect(afterA?.x).toBeCloseTo(beforeA?.x ?? NaN);
        expect(afterA?.y).toBeCloseTo(beforeA?.y ?? NaN);
        expect(afterB?.x).toBeCloseTo(5000);
        expect(distance(afterA!, afterB!)).toBeCloseTo(4000);
    });

    it('keeps the origin at the middle after a length change', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER);
        const longer = setSegmentLength(wall, 6000);

        // The anchor is the midpoint of the new span, so rotation still pivots on the centre.
        expect(longer.transform.x).toBeCloseTo(3000);
        expect(longer.transform.y).toBeCloseTo(0);
    });

    it('turns a wall about its near end', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER);
        const turned = setSegmentAngle(wall, toRadians(90));
        const [a, b] = elementWorldPoints(turned, lookup);

        expect(a?.x).toBeCloseTo(0);
        expect(a?.y).toBeCloseTo(0);
        expect(b?.x).toBeCloseTo(0);
        expect(b?.y).toBeCloseTo(2000);
    });

    it('round-trips the angle it reports', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER);

        for (const degrees of [0, 30, 90, 145, -60]) {
            const turned = setSegmentAngle(wall, toRadians(degrees));

            expect(segmentAngle(turned)).toBeCloseTo(toRadians(degrees));
        }
    });

    it('preserves length when only the angle changes', () => {
        const wall = createWall(point(0, 0), point(3000, 0), LAYER);
        const turned = setSegmentAngle(wall, toRadians(37));
        const [a, b] = elementWorldPoints(turned, lookup);

        expect(distance(a!, b!)).toBeCloseTo(3000);
    });

    it('refuses a length that is not a length', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER);

        expect(setSegmentLength(wall, 0)).toBe(wall);
        expect(setSegmentLength(wall, -5)).toBe(wall);
    });

    it('changes thickness without moving the wall', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER, 150);
        const thicker = setWallThickness(wall, 300);

        expect(thicker.type === 'wall' ? thicker.geometry.thickness : null).toBe(300);
        expect(thicker.transform).toEqual(wall.transform);
        expect(setWallThickness(wall, 0)).toBe(wall);
    });

    it('moves by setting a position outright', () => {
        const wall = createWall(point(0, 0), point(2000, 0), LAYER);
        const moved = setPosition(wall, 5000, 2000);

        expect(moved.transform.x).toBe(5000);
        expect(moved.transform.y).toBe(2000);
        expect(moved.geometry).toEqual(wall.geometry);
    });
});

describe('naming how a line reads', () => {
    const line = () => createLine(point(0, 0), point(3000, 0), LAYER);

    it('writes the one that is chosen', () => {
        expect(setLineType(line(), 'dash-dot-narrow').style?.lineType).toBe('dash-dot-narrow');
    });

    /*
     * Contínua larga is what these shapes are drawn as anyway, so writing it down would fill a
     * drawing with a field that says exactly what its absence already said — and would make
     * two documents that draw identically compare as different in a version diff.
     */
    it('stores the default by taking the field away again', () => {
        const named = setLineType(line(), 'dashed-narrow');
        const back = setLineType(named, 'continuous-wide');

        expect(back.style?.lineType).toBeUndefined();
        expect(back.style).toBeUndefined();
    });

    it('leaves the rest of the style alone either way', () => {
        const hatched = { ...line(), style: { hatch: 'concrete' as const } };

        expect(setLineType(hatched, 'dashed-narrow').style).toEqual({
            hatch: 'concrete',
            lineType: 'dashed-narrow',
        });
        expect(setLineType(hatched, 'continuous-wide').style).toEqual({ hatch: 'concrete' });
    });
});
