import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';

import { defaultLayers, parseDocument } from './document';
import {
    documentBounds,
    drawnLayers,
    elementBounds,
    hitTestElement,
    makeLookup,
    rotateElement,
    translateElement,
} from './elements';
import {
    createCircle,
    createLine,
    createPolygon,
    createRect,
    createUnderlay,
    createWall,
} from './factories';
import { SCHEMA_VERSION, type DoorElement, type Element, type HashiraDocument } from './types';
import { formatAngle, formatLength, formatScale, parseAngle, parseLength } from './units';

const LAYER = 'layer_architecture';

function documentWith(elements: Element[]): HashiraDocument {
    return {
        schemaVersion: 1,
        id: 'doc',
        name: 'Test',
        settings: {
            unit: 'm',
            scale: 50,
            grid: { size: 100, subdivisions: 2, visible: true, snap: true },
            snapping: {
                enabled: true,
                endpoint: true,
                midpoint: true,
                intersection: true,
                axis: true,
            },
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

const noLookup = makeLookup([]);

describe('units', () => {
    it('formats millimetres in the display unit', () => {
        expect(formatLength(3420, 'm')).toBe('3.420 m');
        expect(formatLength(3420, 'cm')).toBe('342.0 cm');
        expect(formatLength(3420, 'mm')).toBe('3420 mm');
        expect(formatScale(50)).toBe('1:50');
    });

    it('reads a bare number in the drawing unit', () => {
        expect(parseLength('3.42', 'm')).toBeCloseTo(3420);
        expect(parseLength('342', 'cm')).toBeCloseTo(3420);
        expect(parseLength('3420', 'mm')).toBeCloseTo(3420);
    });

    it('lets an explicit suffix override the drawing unit', () => {
        expect(parseLength('150mm', 'm')).toBeCloseTo(150);
        expect(parseLength('15 cm', 'm')).toBeCloseTo(150);
        expect(parseLength('1.5 m', 'mm')).toBeCloseTo(1500);
    });

    it('accepts a comma as a decimal separator', () => {
        expect(parseLength('3,42', 'm')).toBeCloseTo(3420);
    });

    it('rejects anything that is not a length', () => {
        for (const input of ['', '   ', 'abc', 'm', '1.2.3', 'NaN']) {
            expect(parseLength(input, 'm')).toBeNull();
        }
    });

    it('formats and reads angles in degrees while storing radians', () => {
        expect(formatAngle(toRadians(45))).toBe('45.0°');
        expect(formatAngle(toRadians(370))).toBe('10.0°');
        expect(parseAngle('45°')).toBeCloseTo(toRadians(45));
        expect(parseAngle('bogus')).toBeNull();
    });

    it('never prints a negative zero angle', () => {
        expect(formatAngle(-0.0001)).toBe('0.0°');
    });
});

describe('factories', () => {
    it('places a line at its own midpoint so rotation pivots there', () => {
        const line = createLine(point(0, 0), point(1000, 0), LAYER);

        expect(line.transform).toEqual({ x: 500, y: 0, rotation: 0 });
        expect(line.geometry.a).toEqual({ x: -500, y: 0 });
        expect(line.geometry.b).toEqual({ x: 500, y: 0 });
    });

    it('builds a rectangle from two opposite corners in any order', () => {
        const a = createRect(point(0, 0), point(400, 200), LAYER);
        const b = createRect(point(400, 200), point(0, 0), LAYER);

        expect(a.geometry).toEqual({ width: 400, height: 200 });
        expect(a.transform.x).toBe(200);
        expect(a.transform.y).toBe(100);
        expect(b.geometry).toEqual(a.geometry);
        expect(b.transform).toEqual(a.transform);
    });

    it('refuses a polygon with fewer than two points', () => {
        expect(createPolygon([], true, LAYER)).toBeNull();
        expect(createPolygon([point(0, 0)], true, LAYER)).toBeNull();
        expect(createPolygon([point(0, 0), point(10, 0)], false, LAYER)).not.toBeNull();
    });
});

describe('element geometry', () => {
    it('reports a wall band, not just its centreline', () => {
        const wall = createWall(point(0, 0), point(1000, 0), LAYER, 200);

        expect(elementBounds(wall, noLookup)).toEqual({
            minX: -100,
            minY: -100,
            maxX: 1100,
            maxY: 100,
        });
    });

    it('rotates about the element anchor, keeping the anchor put', () => {
        const line = createLine(point(0, 0), point(1000, 0), LAYER);
        const rotated = rotateElement(line, { x: 500, y: 0 }, toRadians(90), noLookup);

        expect(rotated.transform.x).toBeCloseTo(500);
        expect(rotated.transform.y).toBeCloseTo(0);
        expect(rotated.transform.rotation).toBeCloseTo(toRadians(90));

        const bounds = elementBounds(rotated, noLookup);
        expect(bounds?.minY).toBeCloseTo(-500);
        expect(bounds?.maxY).toBeCloseTo(500);
    });

    it('moves by changing the transform, not the vertices', () => {
        const rect = createRect(point(0, 0), point(400, 200), LAYER);
        const moved = translateElement(rect, point(100, 50), noLookup);

        expect(moved.transform).toEqual({ x: 300, y: 150, rotation: 0 });
        expect(moved.geometry).toEqual(rect.geometry);
    });

    it('measures the whole drawing', () => {
        const document = documentWith([
            createRect(point(0, 0), point(400, 200), LAYER),
            createCircle(point(1000, 0), 100, LAYER),
        ]);

        expect(documentBounds(document)).toEqual({
            minX: 0,
            minY: -100,
            maxX: 1100,
            maxY: 200,
        });
    });

    /*
     * Which layers a legend lists, and — since a legend of one says nothing — whether a sheet
     * reserves a strip beside the drawing at all. An empty layer is not one a reader can see,
     * and neither is one holding only an underlay: that is a page to trace over, it never
     * reaches the scene, and it certainly never prints.
     */
    it('counts the layers a reader can actually see', () => {
        const document = documentWith([createRect(point(0, 0), point(400, 200), LAYER)]);

        expect(drawnLayers(document).map((layer) => layer.id)).toEqual([LAYER]);

        const traced = documentWith([createUnderlay('underlay_1', point(0, 0), 1000, 1000, LAYER)]);

        expect(drawnLayers(traced)).toEqual([]);
    });

    it('leaves out a layer that has been hidden', () => {
        const document = documentWith([createRect(point(0, 0), point(400, 200), LAYER)]);

        document.layers = document.layers.map((layer) =>
            layer.id === LAYER ? { ...layer, visible: false } : layer,
        );

        expect(drawnLayers(document)).toEqual([]);
    });
});

describe('hit testing', () => {
    it('picks a wall anywhere across its thickness', () => {
        const wall = createWall(point(0, 0), point(1000, 0), LAYER, 200);

        expect(hitTestElement(wall, noLookup, point(500, 90), 1)).toBe(true);
        expect(hitTestElement(wall, noLookup, point(500, 130), 1)).toBe(false);
    });

    it('picks a rectangle on its outline, not through its middle', () => {
        const rect = createRect(point(0, 0), point(400, 200), LAYER);

        expect(hitTestElement(rect, noLookup, point(0, 100), 10)).toBe(true);
        expect(hitTestElement(rect, noLookup, point(200, 100), 10)).toBe(false);
    });

    it('picks a room anywhere inside it, because a room is a space', () => {
        const room: Element = {
            id: 'room',
            type: 'room',
            layerId: LAYER,
            transform: { x: 0, y: 0, rotation: 0 },
            geometry: {
                points: [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)],
            },
        };

        expect(hitTestElement(room, noLookup, point(500, 500), 5)).toBe(true);
    });

    it('picks a circle on its rim, not at its centre', () => {
        const circle = createCircle(point(0, 0), 500, LAYER);

        expect(hitTestElement(circle, noLookup, point(495, 0), 10)).toBe(true);
        expect(hitTestElement(circle, noLookup, point(0, 0), 10)).toBe(false);
    });
});

describe('hosted openings', () => {
    const wall = createWall(point(0, 0), point(4000, 0), LAYER, 150);

    const door: DoorElement = {
        id: 'door',
        type: 'door',
        layerId: 'layer_openings',
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: { hostId: wall.id, offset: 1000, width: 900, swing: 'left', flipped: false },
    };

    const lookup = makeLookup([wall, door]);

    it('positions the opening along its wall', () => {
        const bounds = elementBounds(door, lookup);

        expect(bounds?.minX).toBeCloseTo(550);
        expect(bounds?.maxX).toBeCloseTo(1450);
    });

    it('slides along the wall instead of moving freely', () => {
        const moved = translateElement(door, point(500, 900), lookup);

        expect(moved.type).toBe('door');
        expect(moved.type === 'door' ? moved.geometry.offset : null).toBeCloseTo(1500);
        expect(moved.transform).toEqual(door.transform);
    });

    it('cannot be pushed past the end of its wall', () => {
        const moved = translateElement(door, point(99_000, 0), lookup);

        expect(moved.type === 'door' ? moved.geometry.offset : null).toBeCloseTo(4000 - 450);
    });

    it('ignores rotation, because it follows the wall', () => {
        expect(rotateElement(door, point(0, 0), toRadians(90), lookup)).toBe(door);
    });
});

describe('parsing a document', () => {
    const blank = {
        schemaVersion: 1,
        id: 'doc',
        name: 'Plan',
        settings: {},
        layers: defaultLayers(),
        elements: [],
    };

    it('accepts a document and fills in missing settings', () => {
        const result = parseDocument(blank);

        expect(result.ok).toBe(true);

        if (!result.ok) return;

        expect(result.document.settings.unit).toBe('m');
        expect(result.document.settings.scale).toBe(50);
        expect(result.document.settings.title).toBe('Plan');
        expect(result.document.layers).toHaveLength(5);
    });

    it('gives a drawing with no readable sheet a page to print on', () => {
        const result = parseDocument({
            ...blank,
            schemaVersion: SCHEMA_VERSION,
            settings: { sheets: [{ name: 'Broken' }] },
        });

        expect(result.ok).toBe(true);
        expect(result.ok && result.document.settings.sheets).toHaveLength(1);
        expect(result.ok && result.document.settings.sheets[0]?.name).toBe('Sheet 1');
    });

    it('drops one unreadable sheet without taking the rest of the settings with it', () => {
        const good = {
            id: 'sheet_a',
            name: 'Ground floor',
            size: 'A1',
            orientation: 'portrait',
            scale: 100,
            centre: null,
        };

        const result = parseDocument({
            ...blank,
            schemaVersion: SCHEMA_VERSION,
            settings: { unit: 'cm', sheets: [good, { id: 'sheet_b', size: 'Foolscap' }] },
        });

        expect(result.ok && result.document.settings.sheets.map((sheet) => sheet.id)).toEqual([
            'sheet_a',
        ]);

        // The point of parsing sheets one at a time: a page nobody can read must not cost the
        // drawing its unit, its grid and everything else in the same object.
        expect(result.ok && result.document.settings.unit).toBe('cm');
    });

    it('refuses a document written by a newer schema', () => {
        const result = parseDocument({ ...blank, schemaVersion: 99 });

        expect(result.ok).toBe(false);
        expect(result.ok === false ? result.reason : '').toContain('newer version');
    });

    it('refuses anything that is not a document', () => {
        for (const input of [null, 42, 'plan', [], { name: 'no version' }]) {
            expect(parseDocument(input).ok).toBe(false);
        }
    });

    it('drops a broken element instead of the whole drawing', () => {
        const result = parseDocument({
            ...blank,
            elements: [
                {
                    id: 'good',
                    type: 'line',
                    layerId: 'layer_architecture',
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
                },
                { id: 'bad', type: 'line', layerId: 'layer_architecture' },
                { id: 'alien', type: 'hyperboloid', layerId: 'layer_architecture' },
            ],
        });

        expect(result.ok).toBe(true);

        if (!result.ok) return;

        expect(result.document.elements).toHaveLength(1);
        expect(result.document.elements[0]?.id).toBe('good');
        expect(result.dropped).toHaveLength(2);
    });

    it('drops an opening whose wall is gone, wherever it sits in the list', () => {
        const result = parseDocument({
            ...blank,
            elements: [
                {
                    id: 'door',
                    type: 'door',
                    layerId: 'layer_openings',
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: {
                        hostId: 'missing-wall',
                        offset: 100,
                        width: 900,
                        swing: 'left',
                        flipped: false,
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.ok && result.document.elements).toHaveLength(0);
        expect(result.ok && result.dropped[0]?.reason).toContain('wall');
    });

    it('keeps an opening declared before its wall', () => {
        const result = parseDocument({
            ...blank,
            elements: [
                {
                    id: 'door',
                    type: 'door',
                    layerId: 'layer_openings',
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: {
                        hostId: 'wall',
                        offset: 100,
                        width: 900,
                        swing: 'left',
                        flipped: false,
                    },
                },
                {
                    id: 'wall',
                    type: 'wall',
                    layerId: 'layer_architecture',
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 150 },
                },
            ],
        });

        expect(result.ok && result.document.elements).toHaveLength(2);
    });

    it('reassigns an element pointing at a layer that does not exist', () => {
        const result = parseDocument({
            ...blank,
            elements: [
                {
                    id: 'orphan',
                    type: 'line',
                    layerId: 'layer_that_went_away',
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
                },
            ],
        });

        expect(result.ok && result.document.elements[0]?.layerId).toBe('layer_architecture');
    });
});
