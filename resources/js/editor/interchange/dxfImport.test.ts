import { describe, expect, it } from 'vitest';

import { sceneToDxf } from '@/editor/export/dxf';
import { unionBounds, type Bounds } from '@/editor/geometry/bbox';
import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { elementBounds, elementWorldPoints, makeLookup } from '@/editor/model/elements';
import { createCircle, createText, createWall } from '@/editor/model/factories';
import type { Element } from '@/editor/model/types';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';

import { dxfElements, readDxf, type DxfDrawing } from './dxfImport';

const PALETTE: ScenePalette = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc' };

/** A DXF written the way a file is: a code on one line, its value on the next. */
function dxf(...pairs: (string | number)[]): string {
    return `${pairs.join('\n')}\n`;
}

function entities(...body: (string | number)[]): string {
    return dxf(0, 'SECTION', 2, 'ENTITIES', ...body, 0, 'ENDSEC', 0, 'EOF');
}

function read(text: string): DxfDrawing {
    const result = readDxf(text);

    expect(result.ok, result.ok ? '' : result.reason).toBe(true);

    return result.ok ? result.drawing : ({} as DxfDrawing);
}

/** Everything on every layer, at full size and the right way up. */
function elementsFrom(drawing: DxfDrawing, unitScale = 1): Element[] {
    return dxfElements(drawing.shapes, {
        unitScale,
        layers: new Map(drawing.layers.map((layer) => [layer.name, 'layer_architecture'])),
    });
}

/**
 * What a set of elements covers. Bounds rather than vertices, because a wall's own points are
 * its centreline and what a DXF carries is the band drawn around it.
 */
function extent(elements: readonly Element[]): Bounds | null {
    const lookup = makeLookup(elements);

    return elements.reduce<Bounds | null>(
        (all, element) => unionBounds(all, elementBounds(element, lookup)),
        null,
    );
}

describe('a file that is not one', () => {
    it('says so rather than importing nothing in silence', () => {
        expect(readDxf('this is a text file')).toEqual({
            ok: false,
            reason: 'This file is not a DXF, or it is empty.',
        });

        const headerOnly = readDxf(dxf(0, 'SECTION', 2, 'HEADER', 0, 'ENDSEC', 0, 'EOF'));

        expect(headerOnly.ok).toBe(false);
    });
});

describe('the world it comes from', () => {
    /*
     * A DXF grows upward and a drawing here grows downward. Getting this wrong imports a plan
     * that looks plausible until you notice the doors open into the walls.
     */
    it('mirrors y on the way in', () => {
        const drawing = read(entities(0, 'LINE', 8, 'WALLS', 10, 0, 20, 1000, 11, 500, 21, 2000));

        const line = elementsFrom(drawing)[0];
        const points = elementWorldPoints(line!, makeLookup([line!]));

        expect(points[0]).toEqual({ x: 0, y: -1000 });
        expect(points[1]).toEqual({ x: 500, y: -2000 });
    });

    it('reads the units the file states, and takes them literally', () => {
        const inches = read(
            dxf(
                0,
                'SECTION',
                2,
                'HEADER',
                9,
                '$INSUNITS',
                70,
                1,
                0,
                'ENDSEC',
                0,
                'SECTION',
                2,
                'ENTITIES',
                0,
                'CIRCLE',
                8,
                '0',
                10,
                0,
                20,
                0,
                40,
                1,
                0,
                'ENDSEC',
                0,
                'EOF',
            ),
        );

        expect(inches.unit).toBe('inch');

        const circle = elementsFrom(inches, 25.4)[0];

        expect(circle?.type === 'circle' && circle.geometry.radius).toBe(25.4);
    });

    it('leaves the units open when the file declines to say', () => {
        expect(read(entities(0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 1)).unit).toBeNull();
    });

    /*
     * A survey drawn on a national grid arrives on that grid. Sliding an import to the origin
     * would be friendlier the first time and wrong every time after, because two files that
     * belong on top of each other would no longer be.
     */
    it('keeps the coordinates the file has, however far from the origin they are', () => {
        const drawing = read(
            entities(0, 'LINE', 8, '0', 10, 512_000, 20, 4_180_000, 11, 512_100, 21, 4_180_000),
        );

        const points = elementWorldPoints(
            elementsFrom(drawing)[0]!,
            makeLookup(elementsFrom(drawing)),
        );

        expect(points[0]?.x).toBe(512_000);
        expect(points[0]?.y).toBe(-4_180_000);
    });
});

describe('what comes across', () => {
    it('turns a two-point line into a line and a run into a polygon', () => {
        const drawing = read(
            entities(
                ...[0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 100, 21, 0],
                ...[
                    0,
                    'LWPOLYLINE',
                    8,
                    '0',
                    90,
                    3,
                    70,
                    1,
                    10,
                    0,
                    20,
                    0,
                    10,
                    100,
                    20,
                    0,
                    10,
                    100,
                    20,
                    100,
                ],
            ),
        );

        const kinds = elementsFrom(drawing).map((element) => element.type);

        expect(kinds).toEqual(['line', 'polygon']);
    });

    it('flattens an arc into the run of points it draws', () => {
        const drawing = read(entities(0, 'ARC', 8, '0', 10, 0, 20, 0, 40, 100, 50, 0, 51, 90));

        const arc = elementsFrom(drawing)[0];

        expect(arc?.type).toBe('polygon');
        expect(arc?.type === 'polygon' && arc.geometry.closed).toBe(false);

        // A quarter circle of radius 100, from (100, 0) round to (0, 100) — and mirrored, so
        // the end that was above the centre is below it.
        const points = elementWorldPoints(arc!, makeLookup([arc!]));

        expect(points[0]?.x).toBeCloseTo(100);
        expect(points[0]?.y).toBeCloseTo(0);
        expect(points[points.length - 1]?.x).toBeCloseTo(0);
        expect(points[points.length - 1]?.y).toBeCloseTo(-100);
    });

    /*
     * A bulge is the tangent of a quarter of the angle the arc to the next vertex subtends.
     * Ignoring it is what turns a curved wall into the chord across it.
     */
    it('follows a polyline round its bulges instead of cutting the corner', () => {
        const straight = read(
            entities(0, 'LWPOLYLINE', 8, '0', 90, 2, 10, 0, 20, 0, 10, 200, 20, 0),
        );

        const bulged = read(
            entities(0, 'LWPOLYLINE', 8, '0', 90, 2, 10, 0, 20, 0, 42, 1, 10, 200, 20, 0),
        );

        expect(straight.shapes[0]?.kind === 'polyline' && straight.shapes[0].points).toHaveLength(
            2,
        );

        const points = bulged.shapes[0]?.kind === 'polyline' ? bulged.shapes[0].points : [];

        expect(points.length).toBeGreaterThan(10);

        // A bulge of 1 is a half circle, so the run reaches a hundred off the chord.
        const deepest = Math.max(...points.map((at) => Math.abs(at.y)));

        expect(deepest).toBeCloseTo(100, 0);
    });

    it('reads a label, its size and how it is placed', () => {
        const drawing = read(
            entities(
                0,
                'TEXT',
                8,
                '0',
                10,
                10,
                20,
                20,
                40,
                250,
                1,
                'Living',
                72,
                1,
                11,
                30,
                21,
                40,
            ),
        );

        const label = elementsFrom(drawing)[0];

        expect(label?.type === 'text' && label.geometry.content).toBe('Living');
        expect(label?.type === 'text' && label.geometry.fontSize).toBe(250);
        expect(label?.type === 'text' && label.geometry.align).toBe('center');

        // Centred text is placed by its alignment point, not by 10/20.
        expect(label?.transform.x).toBe(30);
        expect(label?.transform.y).toBe(-40);
    });

    it('strips the mark-up out of a paragraph and keeps the words', () => {
        const drawing = read(
            entities(
                0,
                'MTEXT',
                8,
                '0',
                10,
                0,
                20,
                0,
                40,
                200,
                71,
                1,
                1,
                '{\\fArial|b1;Kitchen}\\Pand utility 45%%d',
            ),
        );

        const label = elementsFrom(drawing)[0];

        expect(label?.type === 'text' && label.geometry.content).toBe('Kitchen and utility 45°');
    });
});

describe('blocks', () => {
    /** A block holding one unit square, and an insert that places it. */
    function withBlock(...insert: (string | number)[]): string {
        return dxf(
            0,
            'SECTION',
            2,
            'BLOCKS',
            0,
            'BLOCK',
            2,
            'SQUARE',
            10,
            0,
            20,
            0,
            0,
            'LINE',
            8,
            'PARTS',
            10,
            0,
            20,
            0,
            11,
            10,
            21,
            0,
            0,
            'ENDBLK',
            0,
            'ENDSEC',
            0,
            'SECTION',
            2,
            'ENTITIES',
            ...insert,
            0,
            'ENDSEC',
            0,
            'EOF',
        );
    }

    /*
     * A DXF of a building is mostly references to blocks — doors, furniture, title marks. A
     * reader that skips them imports an empty file and says it worked.
     */
    it('explodes a block reference where it was placed', () => {
        const drawing = read(withBlock(0, 'INSERT', 2, 'SQUARE', 8, '0', 10, 100, 20, 200));
        const points = drawing.shapes[0]?.kind === 'polyline' ? drawing.shapes[0].points : [];

        expect(points[0]).toEqual({ x: 100, y: 200 });
        expect(points[1]).toEqual({ x: 110, y: 200 });
    });

    it('carries the scale and the turn a reference was placed with', () => {
        const drawing = read(
            withBlock(0, 'INSERT', 2, 'SQUARE', 8, '0', 10, 0, 20, 0, 41, 2, 42, 2, 50, 90),
        );

        const points = drawing.shapes[0]?.kind === 'polyline' ? drawing.shapes[0].points : [];

        // Twice as long and turned a quarter: the far end is now straight up.
        expect(points[1]?.x).toBeCloseTo(0);
        expect(points[1]?.y).toBeCloseTo(20);
    });

    it('keeps the layer the block was drawn on, not the one it was placed on', () => {
        const drawing = read(withBlock(0, 'INSERT', 2, 'SQUARE', 8, 'PLACED', 10, 0, 20, 0));

        expect(drawing.layers.map((layer) => layer.name)).toEqual(['PARTS']);
    });

    it('counts a reference to a block that is not in the file rather than failing', () => {
        const drawing = read(entities(0, 'INSERT', 2, 'MISSING', 8, '0', 10, 0, 20, 0));

        expect(drawing.shapes).toEqual([]);
        expect(drawing.skipped).toEqual([{ type: 'INSERT', count: 1 }]);
    });
});

describe('layers', () => {
    it('reads their colours and what state they were left in', () => {
        const drawing = read(
            dxf(
                0,
                'SECTION',
                2,
                'TABLES',
                0,
                'TABLE',
                2,
                'LAYER',
                0,
                'LAYER',
                2,
                'HIDDEN',
                70,
                1,
                62,
                5,
                0,
                'LAYER',
                2,
                'LOCKED',
                70,
                4,
                62,
                3,
                0,
                'ENDTAB',
                0,
                'ENDSEC',
                0,
                'SECTION',
                2,
                'ENTITIES',
                0,
                'LINE',
                8,
                'HIDDEN',
                10,
                0,
                20,
                0,
                11,
                1,
                21,
                1,
                0,
                'LINE',
                8,
                'LOCKED',
                10,
                0,
                20,
                0,
                11,
                1,
                21,
                1,
                0,
                'ENDSEC',
                0,
                'EOF',
            ),
        );

        const hidden = drawing.layers.find((layer) => layer.name === 'HIDDEN');
        const locked = drawing.layers.find((layer) => layer.name === 'LOCKED');

        expect(hidden?.visible).toBe(false);
        expect(locked?.locked).toBe(true);
        expect(locked?.visible).toBe(true);

        // Colour index 5 is blue and 3 is green, in every DXF ever written.
        expect(hidden?.color).toBe('#2C58C4');
        expect(locked?.color).toBe('#2E8B2E');
    });

    it('counts what is on each, which is what a person picks from', () => {
        const drawing = read(
            entities(
                ...[0, 'LINE', 8, 'A', 10, 0, 20, 0, 11, 1, 21, 1],
                ...[0, 'LINE', 8, 'A', 10, 0, 20, 0, 11, 2, 21, 2],
                ...[0, 'LINE', 8, 'B', 10, 0, 20, 0, 11, 3, 21, 3],
            ),
        );

        expect(drawing.layers.map((layer) => [layer.name, layer.count])).toEqual([
            ['A', 2],
            ['B', 1],
        ]);
    });

    it('brings only the layers it was asked for', () => {
        const drawing = read(
            entities(
                ...[0, 'LINE', 8, 'A', 10, 0, 20, 0, 11, 1, 21, 1],
                ...[0, 'LINE', 8, 'B', 10, 0, 20, 0, 11, 2, 21, 2],
            ),
        );

        const only = dxfElements(drawing.shapes, {
            unitScale: 1,
            layers: new Map([['B', 'layer_architecture']]),
        });

        expect(only).toHaveLength(1);
    });
});

describe('what will not come', () => {
    /*
     * A spline's control points are not on the curve, so joining them draws a shape that is
     * visibly not the one in the file. Saying it was left out beats importing a wrong line.
     */
    it('leaves out a spline that has no points on its own curve, and says so', () => {
        const drawing = read(
            entities(0, 'SPLINE', 8, '0', 10, 0, 20, 0, 10, 50, 20, 100, 10, 100, 20, 0),
        );

        expect(drawing.shapes).toEqual([]);
        expect(drawing.skipped).toEqual([{ type: 'SPLINE', count: 1 }]);
    });

    it('takes a spline that was written down as points it passes through', () => {
        const drawing = read(
            entities(0, 'SPLINE', 8, '0', 11, 0, 21, 0, 11, 50, 21, 100, 11, 100, 21, 0),
        );

        expect(drawing.shapes[0]?.kind === 'polyline' && drawing.shapes[0].points).toHaveLength(3);
    });

    it('counts everything else it met by name', () => {
        const drawing = read(entities(0, 'HATCH', 8, '0', 10, 0, 20, 0, 0, 'HATCH', 8, '0'));

        expect(drawing.skipped).toEqual([{ type: 'HATCH', count: 2 }]);
    });
});

/**
 * The strongest thing a test can say here: a drawing written out and read back is the same
 * drawing. Two independent readings of the format have to agree, and the mirror the writer
 * applies has to be the one the reader undoes.
 */
describe('out and back again', () => {
    const wall = createWall(point(0, 0), point(6000, 0), 'layer_architecture', 150);
    const circle = createCircle(point(2000, 1200), 400, 'layer_architecture');
    const label = createText('Living', point(3000, 900), 'layer_annotations');
    const scene = buildScene([wall, circle, label], defaultLayers(), { palette: PALETTE });

    const drawing = read(
        sceneToDxf(scene, { bounds: { minX: 0, minY: -100, maxX: 6000, maxY: 1600 } }),
    );

    const back = elementsFrom(drawing);

    it('comes back the same size and in the same place', () => {
        const here = extent(back);

        /*
         * The six metre wall, as the band it is drawn as: flush at each end and 75 either side
         * of its centreline. Then the circle 400 below its centre at 1200. Compared against
         * the numbers rather than against the elements it started as, because a wall's own
         * extent is a wall's, and what a DXF carries is the shape drawn around it.
         */
        expect(here?.minX).toBeCloseTo(0, 1);
        expect(here?.maxX).toBeCloseTo(6000, 1);
        expect(here?.minY).toBeCloseTo(-75, 1);
        expect(here?.maxY).toBeCloseTo(1600, 1);
    });

    it('brings the circle back as a circle, not as a run of points', () => {
        const round = back.find((element) => element.type === 'circle');

        expect(round?.type === 'circle' && round.geometry.radius).toBeCloseTo(400);
        expect(round?.transform.x).toBeCloseTo(2000);
        expect(round?.transform.y).toBeCloseTo(1200);
    });

    it('brings the label back where it was written, saying what it said', () => {
        const text = back.find((element) => element.type === 'text');

        expect(text?.type === 'text' && text.geometry.content).toBe('Living');
        expect(text?.transform.x).toBeCloseTo(3000);
        expect(text?.transform.y).toBeCloseTo(900);
    });

    it('brings the wall back as the outline it was drawn as, not as a wall', () => {
        // Nothing in a DXF says which lines are a wall, so nothing imported becomes one.
        expect(back.some((element) => element.type === 'wall')).toBe(false);
        expect(back.some((element) => element.type === 'polygon')).toBe(true);
    });
});
