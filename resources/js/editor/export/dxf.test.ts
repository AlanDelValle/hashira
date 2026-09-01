import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { createCircle, createDoor, createText, createWall } from '@/editor/model/factories';
import { buildScene } from '@/editor/scene/build';
import { pen, type SceneLayer, type ScenePalette } from '@/editor/scene/types';

import { layerNames, nearestAci, sceneToDxf } from './dxf';

const PALETTE: ScenePalette = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc' };
const BOUNDS = { minX: 0, minY: -75, maxX: 6000, maxY: 75 };

/**
 * A DXF, read back.
 *
 * The file is a flat run of group code / value pairs, which is easy to write and just as easy
 * to write *wrongly* — an entity with a missing group is still a valid-looking file. Reading
 * it back into records is the only way a test can say anything about what a CAD program will
 * find, short of opening one.
 */
interface Record {
    type: string;
    groups: [number, string][];
}

function read(dxf: string): { sections: Map<string, Record[]>; pairs: number } {
    const lines = dxf.split('\r\n').slice(0, -1);

    expect(lines.length % 2, 'a DXF is pairs of lines, so there is always an even number').toBe(0);

    const sections = new Map<string, Record[]>();
    let section: Record[] | null = null;
    let current: Record | null = null;

    for (let at = 0; at < lines.length; at += 2) {
        const code = Number(lines[at]);
        const value = lines[at + 1] ?? '';

        if (code === 0) {
            current = { type: value, groups: [] };

            if (value === 'SECTION') {
                section = [];
            } else if (value === 'ENDSEC') {
                section = null;
            } else {
                section?.push(current);
            }

            continue;
        }

        if (code === 2 && current?.type === 'SECTION') {
            section = [];
            sections.set(value, section);
            continue;
        }

        current?.groups.push([code, value]);
    }

    return { sections, pairs: lines.length / 2 };
}

function group(record: Record | undefined, code: number): string | undefined {
    return record?.groups.find(([at]) => at === code)?.[1];
}

function entities(dxf: string, type: string): Record[] {
    return (read(dxf).sections.get('ENTITIES') ?? []).filter((record) => record.type === type);
}

describe('the shape of the file', () => {
    const wall = createWall(point(0, 0), point(6000, 0), 'layer_architecture', 150);
    const scene = buildScene([wall], defaultLayers(), { palette: PALETTE });
    const dxf = sceneToDxf(scene, { bounds: BOUNDS });

    it('is pairs of lines, sections closed, ending in EOF', () => {
        expect(read(dxf).pairs).toBeGreaterThan(20);
        expect(dxf.endsWith('0\r\nEOF\r\n')).toBe(true);
        expect(dxf.split('SECTION').length).toBe(dxf.split('ENDSEC').length);
    });

    it('says which dialect it is, and that its units are millimetres', () => {
        expect(dxf).toContain('AC1009');
        expect(dxf).toContain('$INSUNITS');
    });

    it('declares every layer it draws on, plus the one a DXF always has', () => {
        const table = read(dxf).sections.get('TABLES') ?? [];
        const named = table.filter((record) => record.type === 'LAYER').map((r) => group(r, 2));

        expect(named).toContain('0');
        expect(named).toContain('ARCHITECTURE');
    });
});

describe('the world it lands in', () => {
    /*
     * The drawing grows downward and a DXF grows upward. Getting this wrong produces a file
     * that opens, looks plausible in a thumbnail, and is upside down with its text mirrored.
     */
    it('mirrors y, so the drawing is the right way up in CAD', () => {
        const scene: SceneLayer[] = [
            {
                id: 'l',
                name: 'L',
                primitives: [
                    {
                        kind: 'polyline',
                        points: [point(0, 1000), point(500, 2000)],
                        closed: false,
                        stroke: pen('#17191d'),
                    },
                ],
            },
        ];

        const line = entities(sceneToDxf(scene, { bounds: BOUNDS }), 'LINE')[0];

        expect(group(line, 20)).toBe('-1000.0');
        expect(group(line, 21)).toBe('-2000.0');
    });

    it('writes the extent the same way round', () => {
        const dxf = sceneToDxf([], { bounds: { minX: 0, minY: 100, maxX: 10, maxY: 900 } });

        // The bottom of the drawing is the smallest number in the file.
        expect(dxf).toContain('$EXTMIN\r\n10\r\n0.0\r\n20\r\n-900.0');
        expect(dxf).toContain('$EXTMAX\r\n10\r\n10.0\r\n20\r\n-100.0');
    });

    /*
     * Mirroring y negates every angle and reverses the direction of travel with it. A DXF arc
     * always runs anticlockwise from its start, so the two ends swap — and a door swing that
     * comes back as the other three quarters of the circle is the way this fails.
     */
    it('turns an arc round with the world, keeping the same piece of circle', () => {
        const scene: SceneLayer[] = [
            {
                id: 'l',
                name: 'L',
                primitives: [
                    {
                        kind: 'arc',
                        centre: point(0, 0),
                        radius: 900,
                        from: 0,
                        to: toRadians(90),
                        anticlockwise: false,
                        stroke: pen('#17191d'),
                    },
                ],
            },
        ];

        const arc = entities(sceneToDxf(scene, { bounds: BOUNDS }), 'ARC')[0];

        // 0° to 90° clockwise in a y-down world is 270° to 360° anticlockwise in a y-up one.
        expect(group(arc, 50)).toBe('270.0');
        expect(group(arc, 51)).toBe('0.0');
    });
});

describe('what each primitive becomes', () => {
    const wall = createWall(point(0, 0), point(6000, 0), 'layer_architecture', 150);

    it('writes a two-point run as a line, because that is what it is', () => {
        const scene: SceneLayer[] = [
            {
                id: 'l',
                name: 'L',
                primitives: [
                    {
                        kind: 'polyline',
                        points: [point(0, 0), point(100, 0)],
                        closed: false,
                        stroke: pen('#17191d'),
                    },
                ],
            },
        ];

        const dxf = sceneToDxf(scene, { bounds: BOUNDS });

        expect(entities(dxf, 'LINE')).toHaveLength(1);
        expect(entities(dxf, 'POLYLINE')).toHaveLength(0);
    });

    it('writes a wall as a closed run of vertices, ended properly', () => {
        const scene = buildScene([wall], defaultLayers(), { palette: PALETTE });
        const dxf = sceneToDxf(scene, { bounds: BOUNDS });
        const poly = entities(dxf, 'POLYLINE')[0];

        // 66 is "vertices follow", which R12 requires and without which a reader stops here.
        expect(group(poly, 66)).toBe('1');
        expect(group(poly, 70)).toBe('1');
        expect(entities(dxf, 'VERTEX').length).toBeGreaterThanOrEqual(4);
        expect(entities(dxf, 'SEQEND')).toHaveLength(entities(dxf, 'POLYLINE').length);
    });

    it('keeps a circle a circle', () => {
        const scene = buildScene(
            [createCircle(point(1000, 1000), 400, 'layer_architecture')],
            defaultLayers(),
            {
                palette: PALETTE,
            },
        );

        const circle = entities(sceneToDxf(scene, { bounds: BOUNDS }), 'CIRCLE')[0];

        expect(group(circle, 40)).toBe('400.0');
    });

    it('carries a label, its height and how it is justified', () => {
        const scene = buildScene(
            [createText('Living', point(1000, 2000), 'layer_annotations')],
            defaultLayers(),
            { palette: PALETTE },
        );

        const text = entities(sceneToDxf(scene, { bounds: BOUNDS }), 'TEXT')[0];

        expect(group(text, 1)).toBe('Living');
        expect(Number(group(text, 40))).toBeGreaterThan(0);

        // Centred text is placed by its alignment point, which a reader takes from 11/21.
        expect(group(text, 72)).toBe('1');
        expect(group(text, 21)).toBe('-2000.0');
    });

    /*
     * R12 has no ellipse, and a new element type in the scene would cost a branch in every
     * other exporter for a shape that is a few millimetres on the finished sheet — finer
     * flattened than the plotter draws it.
     */
    it('flattens an ellipse into a closed run of points', () => {
        const scene: SceneLayer[] = [
            {
                id: 'l',
                name: 'L',
                primitives: [
                    {
                        kind: 'ellipse',
                        centre: point(0, 0),
                        rx: 400,
                        ry: 200,
                        rotation: 0,
                        stroke: pen('#17191d'),
                    },
                ],
            },
        ];

        const dxf = sceneToDxf(scene, { bounds: BOUNDS });

        expect(group(entities(dxf, 'POLYLINE')[0], 70)).toBe('1');
        expect(entities(dxf, 'VERTEX')).toHaveLength(48);
    });

    it('does not fall over on a door, which is where the arcs come from', () => {
        const scene = buildScene(
            [wall, createDoor(wall.id, 2000, 'layer_openings')],
            defaultLayers(),
            {
                palette: PALETTE,
            },
        );

        const dxf = sceneToDxf(scene, { bounds: BOUNDS });

        expect(entities(dxf, 'ARC').length).toBeGreaterThan(0);
        expect(read(dxf).pairs).toBeGreaterThan(50);
    });
});

describe('layer names', () => {
    function named(...names: string[]): string[] {
        const layers = names.map((name, at) => ({ id: `l${at}`, name, primitives: [] }));

        return [...layerNames(layers).values()];
    }

    it('makes a name R12 will take', () => {
        expect(named('Ground floor')).toEqual(['GROUND_FLOOR']);
        expect(named('Dimensions')).toEqual(['DIMENSIONS']);
    });

    /*
     * Two layers reduced to the same name would merge on the way out, and a drawing that
     * arrives with its walls and its furniture on one layer has quietly lost something.
     */
    it('never lets two layers collapse into one', () => {
        expect(named('Level 1', 'Level:1')).toEqual(['LEVEL_1', 'LEVEL_1_2']);
    });

    it('always has a name, even for a layer that has nothing usable in its own', () => {
        expect(named('图层')).toEqual(['LAYER']);
        expect(named('0')).toEqual(['0_2']);
    });
});

describe('colours', () => {
    /*
     * Matched by hue rather than by distance in RGB: the drawing's blue and its mid grey are
     * neighbours in RGB, and a plan whose dimensions arrive grey has lost the one distinction
     * its palette makes.
     */
    it('places the drawing palette where a drafter would expect it', () => {
        expect(nearestAci('#1F2328')).toBe(7);
        expect(nearestAci('#5F636B')).toBe(8);
        expect(nearestAci('#2C58C4')).toBe(5);
    });

    it('reads the six hues off the colour wheel', () => {
        expect(nearestAci('#ff0000')).toBe(1);
        expect(nearestAci('#ffff00')).toBe(2);
        expect(nearestAci('#00ff00')).toBe(3);
        expect(nearestAci('#00ffff')).toBe(4);
        expect(nearestAci('#0000ff')).toBe(5);
        expect(nearestAci('#ff00ff')).toBe(6);
    });

    it('falls back to ink rather than throwing on a colour it cannot read', () => {
        expect(nearestAci('rebeccapurple')).toBe(7);
    });
});
