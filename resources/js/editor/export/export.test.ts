import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import {
    createAsset,
    createCircle,
    createDimension,
    createDoor,
    createRect,
    createWall,
    createWindow,
} from '@/editor/model/factories';
import { ASSET_LIBRARY } from '@/editor/assets/library';
import type { DoorElement } from '@/editor/model/types';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';

import { toPathData } from './path';
import { sceneToPdf } from './pdf';
import { layoutSheet, nextStandardScale, scaleBarMetres } from './sheet';
import { sceneToSvg } from './svg';

const LAYER = 'layer_architecture';

const PALETTE: ScenePalette = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc' };

describe('path data', () => {
    it('writes a polyline, closing it only when asked', () => {
        const open = toPathData({
            kind: 'polyline',
            points: [point(0, 0), point(100, 0), point(100, 50)],
            closed: false,
            stroke: null,
        });

        expect(open).toBe('M 0 0 L 100 0 L 100 50');

        const closed = toPathData({
            kind: 'polyline',
            points: [point(0, 0), point(100, 0)],
            closed: true,
            stroke: null,
        });

        expect(closed?.endsWith('Z')).toBe(true);
    });

    it('writes an arc with the sweep and large-arc flags its direction implies', () => {
        const quarter = toPathData({
            kind: 'arc',
            centre: point(0, 0),
            radius: 100,
            from: 0,
            to: Math.PI / 2,
            anticlockwise: false,
            stroke: { color: '#000', width: { kind: 'pen', mm: 0.25 } },
        });

        // A quarter turn clockwise: sweep 1, large-arc 0.
        expect(quarter).toContain('A 100 100 0 0 1');

        const most = toPathData({
            kind: 'arc',
            centre: point(0, 0),
            radius: 100,
            from: 0,
            to: toRadians(270),
            anticlockwise: false,
            stroke: { color: '#000', width: { kind: 'pen', mm: 0.25 } },
        });

        expect(most).toContain('A 100 100 0 1 1');
    });

    it('has no path for the primitives that are not paths', () => {
        expect(
            toPathData({ kind: 'circle', centre: point(0, 0), radius: 10, stroke: null }),
        ).toBeNull();
    });
});

describe('sheet layout', () => {
    const bounds = { minX: 0, minY: 0, maxX: 6000, maxY: 4000 };

    it('keeps the requested scale when the drawing fits', () => {
        const layout = layoutSheet(bounds, 'A3', 'landscape', 50);

        expect(layout.scale).toBe(50);
        expect(layout.rescaled).toBe(false);
    });

    it('steps to the next standard scale rather than inventing one', () => {
        // A 60 m building will not fit an A4 at 1:50.
        const layout = layoutSheet(
            { minX: 0, minY: 0, maxX: 60_000, maxY: 40_000 },
            'A4',
            'portrait',
            50,
        );

        expect(layout.rescaled).toBe(true);
        expect([100, 200, 500, 1000]).toContain(layout.scale);
    });

    it('never magnifies past what was asked for', () => {
        const tiny = layoutSheet({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 'A1', 'landscape', 50);

        expect(tiny.scale).toBe(50);
    });

    it('rounds a scale up to one a drafter would recognise', () => {
        expect(nextStandardScale(37)).toBe(50);
        expect(nextStandardScale(50)).toBe(50);
        expect(nextStandardScale(101)).toBe(200);
    });

    it('picks the longest round bar that fits the space it has', () => {
        // At 1:50, ten metres is 200 mm of paper and two metres is 40 mm.
        expect(scaleBarMetres(50, 200)).toBe(10);
        expect(scaleBarMetres(50, 50)).toBe(2);

        // At 1:1000 five metres is only 5 mm, so it still fits.
        expect(scaleBarMetres(1000, 5)).toBe(5);

        // And when even a single metre will not fit, one metre is what gets drawn.
        expect(scaleBarMetres(50, 5)).toBe(1);
    });

    it('centres the drawing in the frame', () => {
        const layout = layoutSheet(bounds, 'A3', 'landscape', 50);
        const drawnWidth = 6000 * layout.unitsPerWorldMm;
        const leftGap = (bounds.minX - layout.origin.x) * layout.unitsPerWorldMm;
        const rightGap = layout.frame.width - drawnWidth - leftGap;

        expect(leftGap).toBeCloseTo(rightGap);
    });
});

describe('SVG export', () => {
    const wall = createWall(point(0, 0), point(4000, 0), LAYER, 150);

    const door: DoorElement = {
        id: 'door',
        type: 'door',
        layerId: 'layer_openings',
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: { hostId: wall.id, offset: 2000, width: 900, swing: 'left', flipped: false },
    };

    const scene = buildScene([wall, door], defaultLayers(), { palette: PALETTE });

    const svg = sceneToSvg(scene, {
        bounds: { minX: 0, minY: -75, maxX: 4000, maxY: 75 },
        scale: 50,
        title: 'Test plan',
    });

    it('is a well-formed SVG document', () => {
        expect(svg.startsWith('<?xml')).toBe(true);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    });

    it('states its real size on paper, so 1:50 opens as a fiftieth', () => {
        // 4000 mm of wall plus a 10 mm sheet margin either side, at 1:50 → 80 + 20 = 100 mm.
        expect(svg).toContain('width="100mm"');
    });

    it('writes a measurement it read off the geometry', () => {
        // The four outputs are fed by one scene, so a dimension appearing here is a dimension
        // appearing on screen, in the PNG and in the PDF as well.
        const measured = sceneToSvg(
            buildScene(
                [createDimension(point(0, 0), point(4000, 0), 800, 'layer_dimensions')],
                defaultLayers(),
                { palette: PALETTE, unit: 'm' },
            ),
            { bounds: { minX: 0, minY: 0, maxX: 4000, maxY: 900 }, scale: 50, title: 'Measured' },
        );

        expect(measured).toContain('4.000 m');
    });

    it('says a measurement in the drawing’s own unit', () => {
        const inMillimetres = sceneToSvg(
            buildScene(
                [createDimension(point(0, 0), point(4000, 0), 800, 'layer_dimensions')],
                defaultLayers(),
                { palette: PALETTE, unit: 'mm' },
            ),
            { bounds: { minX: 0, minY: 0, maxX: 4000, maxY: 900 }, scale: 50, title: 'Measured' },
        );

        expect(inMillimetres).toContain('4000 mm');
    });

    it('keeps layers as groups', () => {
        expect(svg).toContain('id="layer_architecture"');
        expect(svg).toContain('data-layer="Openings"');
    });

    it('scales a pen weight into the file’s units but leaves a real thickness alone', () => {
        // The wall band is a real 150 mm; a 0.25 mm pen at 1:50 is 12.5 world millimetres.
        expect(svg).toContain('stroke-width="150"');
        expect(svg).toContain('stroke-width="12.5"');
    });

    it('cuts the opening out of the wall rather than drawing over it', () => {
        const wallPaths = [...svg.matchAll(/<path d="M 0 0 L (\d+) 0"/g)];

        // The wall is drawn as two spans, stopping where the door starts.
        expect(wallPaths[0]?.[1]).toBe('1550');
        expect(svg).toContain('M 2450 0 L 4000 0');
    });

    it('escapes text rather than letting it break the document', () => {
        const nasty = sceneToSvg(
            [
                {
                    id: 'l',
                    name: 'Layer',
                    primitives: [
                        {
                            kind: 'text',
                            at: point(0, 0),
                            content: 'Kitchen & <Bath>',
                            size: 200,
                            align: 'left',
                            rotation: 0,
                            fill: '#000000',
                        },
                    ],
                },
            ],
            { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, scale: 50 },
        );

        expect(nasty).toContain('Kitchen &amp; &lt;Bath&gt;');
        expect(nasty).not.toContain('<Bath>');
    });
});

describe('PDF export', () => {
    const wall = createWall(point(0, 0), point(6000, 0), LAYER, 150);
    const scene = buildScene([wall], defaultLayers(), { palette: PALETTE });

    it('produces a real PDF', async () => {
        const blob = await sceneToPdf(scene, {
            bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
            scale: 50,
            sheet: { size: 'A3', orientation: 'landscape' },
            title: 'Studio Apartment',
        });

        expect(blob.type).toBe('application/pdf');

        const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 5);

        expect(new TextDecoder().decode(head)).toBe('%PDF-');
        expect(blob.size).toBeGreaterThan(1000);
    });

    it('does not fall over on the whole element vocabulary', async () => {
        const everything = buildScene(
            [
                wall,
                createDoor(wall.id, 2000, 'layer_openings'),
                createWindow(wall.id, 4000, 'layer_openings'),
                createCircle(point(1000, 1000), 400, LAYER),
                createRect(point(2000, 800), point(3000, 1600), LAYER),
                createAsset(ASSET_LIBRARY[0]!, point(4000, 1200)),
                createDimension(point(0, 0), point(4000, 0), 800, 'layer_dimensions'),
            ],
            defaultLayers(),
            { palette: PALETTE },
        );

        const blob = await sceneToPdf(everything, {
            bounds: { minX: 0, minY: -200, maxX: 6000, maxY: 2000 },
            scale: 50,
            sheet: { size: 'A3', orientation: 'landscape' },
            title: 'Everything',
        });

        expect(blob.size).toBeGreaterThan(1000);
    });
});
