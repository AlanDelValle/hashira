import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';
import { defaultLayers, emptyDocument } from '@/editor/model/document';
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
import type {
    DoorElement,
    HashiraDocument,
    Sheet,
    SheetOrientation,
    SheetSize,
} from '@/editor/model/types';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';

import { toPathData } from './path';
import { exportDocument, pdfPageCount } from './index';
import { sceneToPdf, textOrigin } from './pdf';
import { layoutSheet, nextStandardScale, scaleBarMetres, sheetAside, sheetInWorld } from './sheet';
import { sceneToSvg } from './svg';

const LAYER = 'layer_architecture';

const PALETTE: ScenePalette = {
    ink: '#17191d',
    subtle: '#5f636b',
    roomFill: '#f2f5fc',
    sheet: '#ffffff',
};

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
            stroke: { color: '#000', width: 0.25 },
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
            stroke: { color: '#000', width: 0.25 },
        });

        expect(most).toContain('A 100 100 0 1 1');
    });

    it('has no path for the primitives that are not paths', () => {
        expect(
            toPathData({ kind: 'circle', centre: point(0, 0), radius: 10, stroke: null }),
        ).toBeNull();
    });
});

/** A sheet framing the whole drawing, which is what every drawing starts with. */
function sheet(
    size: SheetSize,
    orientation: SheetOrientation,
    scale: number,
    centre: Sheet['centre'] = null,
): Sheet {
    return { id: 'sheet_1', name: 'Sheet 1', size, orientation, scale, centre };
}

describe('sheet layout', () => {
    const bounds = { minX: 0, minY: 0, maxX: 6000, maxY: 4000 };

    it('keeps the requested scale when the drawing fits', () => {
        const layout = layoutSheet(bounds, sheet('A3', 'landscape', 50));

        expect(layout.scale).toBe(50);
        expect(layout.rescaled).toBe(false);
    });

    it('steps to the next standard scale rather than inventing one', () => {
        // A 60 m building will not fit an A4 at 1:50.
        const layout = layoutSheet(
            { minX: 0, minY: 0, maxX: 60_000, maxY: 40_000 },
            sheet('A4', 'portrait', 50),
        );

        expect(layout.rescaled).toBe(true);
        expect([100, 200, 500, 1000]).toContain(layout.scale);
    });

    it('never magnifies past what was asked for', () => {
        const tiny = layoutSheet(
            { minX: 0, minY: 0, maxX: 100, maxY: 100 },
            sheet('A1', 'landscape', 50),
        );

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
        const layout = layoutSheet(bounds, sheet('A3', 'landscape', 50));
        const drawnWidth = 6000 * layout.unitsPerWorldMm;
        const leftGap = (bounds.minX - layout.origin.x) * layout.unitsPerWorldMm;
        const rightGap = layout.frame.width - drawnWidth - leftGap;

        expect(leftGap).toBeCloseTo(rightGap);
    });
});

/**
 * The strip beside the drawing is paid for in drawing area rather than taken out of the
 * margins, which is the whole reason the canvas has to know about it: a sheet outline that
 * reserved a strip the print does not would promise room the print has not got.
 */
describe('a strip of notes beside the drawing', () => {
    const page = sheet('A3', 'landscape', 50);
    const extent = { minX: 0, minY: -75, maxX: 6000, maxY: 75 };

    it('comes out of the drawing, not out of the paper', () => {
        const plain = layoutSheet(extent, page);
        const noted = layoutSheet(extent, page, true);

        expect(plain.aside).toBeNull();
        expect(noted.aside).not.toBeNull();
        expect(noted.frame.width).toBeLessThan(plain.frame.width);
        expect(noted.frame.width + (noted.aside?.width ?? 0)).toBeCloseTo(plain.frame.width);

        // The border encloses the same paper either way: a strip moves the line inside it.
        expect(noted.box.width).toBeCloseTo(plain.box.width);
    });

    it('stands beside the drawing, to its full height', () => {
        const noted = layoutSheet(extent, page, true);

        expect(noted.aside?.x).toBeCloseTo(noted.frame.x + noted.frame.width);
        expect(noted.aside?.height).toBeCloseTo(noted.frame.height);
    });

    /*
     * A strip costs drawing area, so it is only reserved when something would be printed in
     * it — and a legend naming the one layer a reader is already looking at is not something.
     */
    it('is not reserved when there is nothing to put in it', () => {
        const one = [{ name: 'Architecture', color: '#1F2328' }];

        expect(sheetAside('', one)).toBeNull();
        expect(sheetAside('   \n  ', one)).toBeNull();
        expect(sheetAside('Do not scale.', one)?.legend).toEqual([]);
    });

    it('takes one note to a line, and drops the blank ones', () => {
        const aside = sheetAside('  Do not scale.  \n\nVerify on site.\n', []);

        expect(aside?.notes).toEqual(['Do not scale.', 'Verify on site.']);
    });

    it('lists the layers once there is more than one to tell apart', () => {
        const layers = [
            { name: 'Architecture', color: '#1F2328' },
            { name: 'Dimensions', color: '#2C58C4' },
        ];

        expect(sheetAside('', layers)?.legend).toEqual(layers);
    });
});

/**
 * A sheet with a centre is a window rather than a frame, and the arithmetic runs the other
 * way: the scale is the one somebody asked for and the extent is whatever fits around the
 * point it looks at. A drawing bigger than that runs off the page, which is the point of
 * putting a plan across several of them.
 */
describe('a sheet placed over part of a drawing', () => {
    const huge = { minX: 0, minY: 0, maxX: 500_000, maxY: 500_000 };
    const placed = sheet('A3', 'landscape', 50, { x: 10_000, y: 4000 });

    it('keeps the scale it was given, however much drawing there is', () => {
        const layout = layoutSheet(huge, placed);

        expect(layout.scale).toBe(50);
        expect(layout.rescaled).toBe(false);
    });

    it('looks at the point it was placed on', () => {
        const layout = layoutSheet(huge, placed);
        const world = sheetInWorld(layout);

        expect((world.frame.minX + world.frame.maxX) / 2).toBeCloseTo(10_000);
        expect((world.frame.minY + world.frame.maxY) / 2).toBeCloseTo(4000);
    });

    it('shows exactly the drawing that fits its frame at that scale', () => {
        const layout = layoutSheet(huge, placed);
        const world = sheetInWorld(layout);

        // An A3 landscape is 420 mm wide; less two 12 mm margins, the frame is 396 mm, which
        // at 1:50 is 19.8 m of building.
        expect(world.frame.maxX - world.frame.minX).toBeCloseTo(396 * 50);
        expect(world.page.maxX - world.page.minX).toBeCloseTo(420 * 50);
    });
});

/**
 * Regression cover for a reported fault: vertical dimensions were centred on their line on
 * screen, in the SVG and in the PNG, and slid off it in the PDF alone.
 *
 * The canvas and the SVG each have a notion of alignment and apply it in the text's own
 * frame. A PDF has none — `drawText` starts the baseline at the point given and rotates the
 * run about it — so the exporter centres the text itself, and was doing it along the page's
 * x axis. That is the same direction as the baseline only while the text is horizontal.
 */
describe('placing text on a PDF page', () => {
    const WIDTH = 100;

    it('centres horizontal text by backing up along the page', () => {
        expect(textOrigin({ x: 200, y: 500 }, WIDTH, 'center', 0)).toEqual({ x: 150, y: 500 });
    });

    it('centres a quarter-turned run along its own baseline, not sideways', () => {
        const origin = textOrigin({ x: 200, y: 500 }, WIDTH, 'center', toRadians(90));

        // The run travels down the page, so the start moves up it — and not one point across.
        expect(origin.x).toBeCloseTo(200, 9);
        expect(origin.y).toBeCloseTo(550, 9);
    });

    it('centres a run turned the other way just as evenly', () => {
        const origin = textOrigin({ x: 200, y: 500 }, WIDTH, 'center', toRadians(-90));

        expect(origin.x).toBeCloseTo(200, 9);
        expect(origin.y).toBeCloseTo(450, 9);
    });

    it('keeps the anchor the same distance away whichever way the text is turned', () => {
        // Whatever the angle, the anchor sits half a width along the baseline from the start:
        // that is what being centred means, and it is what the old code lost when it turned.
        for (const degrees of [0, 30, 45, 90, 135, 180, -45, -90]) {
            const origin = textOrigin({ x: 0, y: 0 }, WIDTH, 'center', toRadians(degrees));

            expect(Math.hypot(origin.x, origin.y)).toBeCloseTo(WIDTH / 2, 9);
        }
    });

    it('puts the end of a right-aligned run on the anchor', () => {
        const origin = textOrigin({ x: 0, y: 0 }, WIDTH, 'right', toRadians(90));

        expect(origin.y).toBeCloseTo(WIDTH, 9);
    });

    it('leaves left-aligned text exactly where it was asked for', () => {
        expect(textOrigin({ x: 12, y: 34 }, WIDTH, 'left', toRadians(90))).toEqual({
            x: 12,
            y: 34,
        });
    });
});

describe('SVG export', () => {
    const wall = createWall(point(0, 0), point(4000, 0), LAYER, 150);

    const door: DoorElement = {
        id: 'door',
        type: 'door',
        layerId: 'layer_openings',
        transform: { x: 0, y: 0, rotation: 0 },
        geometry: {
            hostId: wall.id,
            offset: 2000,
            width: 900,
            swing: 'left',
            flipped: false,
            leaf: 'single',
            head: 'square',
        },
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
                [createDimension([point(0, 0), point(4000, 0)], 800, 'layer_dimensions')],
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
                [createDimension([point(0, 0), point(4000, 0)], 800, 'layer_dimensions')],
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

    it('scales a pen weight into the file’s units', () => {
        // A 0.25 mm pen at 1:50 is 12.5 world millimetres in a file measured in those.
        expect(svg).toContain('stroke-width="12.5"');
    });

    it('cuts the opening out of the wall rather than drawing over it', () => {
        // The poché is a band 150 mm across, filled as two runs that stop either side of the
        // door rather than as one run with a door painted over it.
        expect(svg).toContain(
            '<path d="M 0 -75 L 1550 -75 L 1550 75 L 0 75 Z' +
                ' M 2450 -75 L 4000 -75 L 4000 75 L 2450 75 Z" fill="#1F2328"/>',
        );
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

/**
 * The operators of every content stream in a PDF, as text.
 *
 * pdf-lib deflates the streams it writes, so what a page actually draws cannot be read out of
 * the file directly — and a clipping path that quietly stopped being written is exactly the
 * kind of regression that only shows up on somebody's print.
 */
function pdfOperators(bytes: ArrayBuffer): string {
    const raw = new Uint8Array(bytes);
    const text = new TextDecoder('latin1').decode(raw);
    const streams: string[] = [];
    const marker = /stream\r?\n/g;

    for (let match = marker.exec(text); match !== null; match = marker.exec(text)) {
        const from = match.index + match[0].length;
        const to = text.indexOf('endstream', from);

        if (to === -1) continue;

        try {
            streams.push(inflateSync(raw.subarray(from, to)).toString('latin1'));
        } catch {
            // Not every stream in a PDF is deflated, and the ones that are not are of no
            // interest here.
        }
    }

    return streams.join('\n');
}

/**
 * A run of text as a PDF holds it: hex, because pdf-lib writes every string it draws through
 * the font's own encoding rather than as characters anybody could read out of the file.
 */
function written(text: string): string {
    return [...text].map((letter) => letter.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

describe('PDF export', () => {
    const wall = createWall(point(0, 0), point(6000, 0), LAYER, 150);
    const scene = buildScene([wall], defaultLayers(), { palette: PALETTE });

    it('produces a real PDF', async () => {
        const blob = await sceneToPdf([{ sheet: sheet('A3', 'landscape', 50), layers: scene }], {
            bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
            title: 'Studio Apartment',
        });

        expect(blob.type).toBe('application/pdf');

        const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 5);

        expect(new TextDecoder().decode(head)).toBe('%PDF-');
        expect(blob.size).toBeGreaterThan(1000);
    });

    /*
     * Without this, a sheet placed over part of a plan prints the rest of the plan across its
     * own margins and straight through the title block, because a page only clips at its own
     * edge and the frame is well inside that.
     */
    it('clips the drawing to the frame, so nothing runs into the title block', async () => {
        const blob = await sceneToPdf(
            [{ sheet: sheet('A3', 'landscape', 50, { x: 0, y: 0 }), layers: scene }],
            { bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 }, title: 'Placed' },
        );

        // "re W n": a rectangle taken as the clipping path, then dropped as a path so it is
        // not also painted.
        expect(pdfOperators(await blob.arrayBuffer())).toMatch(/re\s+W\s+n/);
    });

    /*
     * A title block that cannot say who drew a thing, for whom, or which revision it is, is a
     * heading rather than a title block — and multi-sheet is not much use for issuing work
     * without one.
     *
     * Each fact is written under its own label, because a stamp is read by position and by
     * label: "C" on its own is a letter, not a revision.
     */
    it('writes what the title block was given, under labels, and leaves empty fields out', async () => {
        const blob = await sceneToPdf([{ sheet: sheet('A3', 'landscape', 50), layers: scene }], {
            bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
            title: 'Ground floor',
            titleBlock: {
                project: 'Maltings, unit 4',
                client: '',
                drawnBy: 'AD',
                revision: 'C',
                date: '2026-03-14',
            },
        });

        const content = pdfOperators(await blob.arrayBuffer()).toLowerCase();

        expect(content).toContain(written('PROJECT'));
        expect(content).toContain(written('Maltings, unit 4'));
        expect(content).toContain(written('DRAWN BY'));
        expect(content).toContain(written('REV'));

        // The scale is the drawing's promise, so the stamp states it whether or not anybody
        // filled anything in.
        expect(content).toContain(written('SCALE'));
        expect(content).toContain(written('1:50'));

        // The date it was issued, rather than the day it happened to be printed.
        expect(content).toContain(written('2026-03-14'));

        // An empty field prints nothing at all, not a label with a gap after it.
        expect(content).not.toContain(written('CLIENT'));
    });

    /*
     * What a drawing cannot say in geometry it says in the strip: the notes, numbered so they
     * can be referred to on site, and a legend naming the layers the reader is looking at.
     */
    it('prints the notes and the legend beside the drawing', async () => {
        const blob = await sceneToPdf(
            [
                {
                    sheet: sheet('A3', 'landscape', 50),
                    layers: scene,
                    legend: [
                        { name: 'Architecture', color: '#1F2328' },
                        { name: 'Dimensions', color: '#2C58C4' },
                    ],
                },
            ],
            {
                bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
                title: 'Ground floor',
                notes: 'Do not scale from this drawing.\nVerify every dimension on site.',
            },
        );

        const content = pdfOperators(await blob.arrayBuffer()).toLowerCase();

        expect(content).toContain(written('NOTES'));
        expect(content).toContain(written('LAYERS'));
        expect(content).toContain(written('Architecture'));
        expect(content).toContain(written('Dimensions'));

        // Numbered, because there is more than one of them.
        expect(content).toContain(written('2.'));
    });

    /** The sheet says what plotted it, quietly, the way an office stamps its own paper. */
    it('signs the sheet', async () => {
        const blob = await sceneToPdf([{ sheet: sheet('A3', 'landscape', 50), layers: scene }], {
            bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
            title: 'Ground floor',
        });

        expect(pdfOperators(await blob.arrayBuffer()).toLowerCase()).toContain(written('Hashira'));
    });

    /*
     * A cell is a fixed width and a title is not. Left alone, a long one runs straight through
     * the rule beside it and into the project's name — which is worse than being cut short,
     * because the reader cannot tell which of the two strings they are looking at.
     */
    it('cuts a title short rather than letting it run into the next cell', async () => {
        const title = 'Ground floor general arrangement, including the whole of the west wing';

        const blob = await sceneToPdf([{ sheet: sheet('A4', 'portrait', 50), layers: scene }], {
            bounds: { minX: 0, minY: -75, maxX: 6000, maxY: 75 },
            title,
        });

        const content = pdfOperators(await blob.arrayBuffer()).toLowerCase();

        expect(content).toContain(written('Ground floor'));
        expect(content).not.toContain(written(title));
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
                createDimension([point(0, 0), point(4000, 0)], 800, 'layer_dimensions'),
            ],
            defaultLayers(),
            { palette: PALETTE },
        );

        const blob = await sceneToPdf(
            [{ sheet: sheet('A3', 'landscape', 50), layers: everything }],
            { bounds: { minX: 0, minY: -200, maxX: 6000, maxY: 2000 }, title: 'Everything' },
        );

        expect(blob.size).toBeGreaterThan(1000);
    });

    /*
     * A set of layer prints is only useful if they lay over each other, which they do because
     * every page is laid out from the same extent rather than from what happens to be on it.
     */
    it('prints a page per sheet and per layer, all framing the same drawing', async () => {
        const plan = buildScene(
            [wall, createDimension([point(0, 0), point(4000, 0)], 800, 'layer_dimensions')],
            defaultLayers(),
            { palette: PALETTE },
        );

        const a = sheet('A3', 'landscape', 50);
        const b = { ...sheet('A4', 'portrait', 100), id: 'sheet_2', name: 'Sheet 2' };

        const blob = await sceneToPdf(
            [
                { sheet: a, layers: [plan[0]!], label: 'Sheet 1 · Architecture' },
                { sheet: a, layers: [plan[1]!], label: 'Sheet 1 · Dimensions' },
                { sheet: b, layers: plan, label: 'Sheet 2' },
            ],
            { bounds: { minX: 0, minY: -200, maxX: 6000, maxY: 2000 }, title: 'Set' },
        );

        // The clip is written once per page, so counting it counts the pages — and unlike
        // the page objects themselves, a content stream is something this can read back.
        expect(pdfOperators(await blob.arrayBuffer()).match(/re\s+W\s+n/g)).toHaveLength(3);
    });
});

/**
 * Which pages come out, and what the file is called.
 *
 * A drawing on one sheet exports as itself; picking one page out of several says which one in
 * the name, because a folder of files all called `ground-floor.pdf` helps nobody.
 */
describe('choosing what to export', () => {
    const SECOND: Sheet = {
        id: 'sheet_2',
        name: 'Detail',
        size: 'A4',
        orientation: 'portrait',
        scale: 20,
        centre: { x: 0, y: 0 },
    };

    function drawing(): HashiraDocument {
        const blank = emptyDocument('Ground floor');
        const wall = createWall(point(0, 0), point(6000, 0), LAYER, 150);

        return {
            ...blank,
            elements: [
                wall,
                createDoor(wall.id, 2000, 'layer_openings'),
                createDimension([point(0, 0), point(6000, 0)], 800, 'layer_dimensions'),
            ],
            settings: {
                ...blank.settings,
                sheets: [...blank.settings.sheets, SECOND],
            },
        };
    }

    it('prints the sheets it was given, one page each', () => {
        expect(pdfPageCount(drawing(), { sheetIds: ['sheet_1', 'sheet_2'] })).toBe(2);
        expect(pdfPageCount(drawing(), { sheetIds: ['sheet_2'] })).toBe(1);
    });

    it('falls back to the first sheet when it was told nothing', () => {
        expect(pdfPageCount(drawing(), {})).toBe(1);
    });

    /*
     * Three of the five default layers have nothing on them. A blank page per empty layer is
     * a stack of paper nobody asked for.
     */
    it('gives each layer that has something on it a page, and skips the ones that do not', () => {
        expect(pdfPageCount(drawing(), { sheetIds: ['sheet_1'], perLayer: true })).toBe(3);
        expect(pdfPageCount(drawing(), { sheetIds: ['sheet_1', 'sheet_2'], perLayer: true })).toBe(
            6,
        );
    });

    it('names the file after the drawing, and after the sheet when one was picked out', async () => {
        const both = await exportDocument(drawing(), 'pdf', {
            sheetIds: ['sheet_1', 'sheet_2'],
        });

        expect(both?.filename).toBe('ground-floor.pdf');

        const one = await exportDocument(drawing(), 'pdf', { sheetIds: ['sheet_2'] });

        expect(one?.filename).toBe('ground-floor-detail.pdf');

        const layers = await exportDocument(drawing(), 'pdf', {
            sheetIds: ['sheet_2'],
            perLayer: true,
        });

        expect(layers?.filename).toBe('ground-floor-detail-layers.pdf');
    });

    it('has nothing to hand over when every sheet it was asked for is gone', async () => {
        expect(await exportDocument(drawing(), 'pdf', { sheetIds: ['sheet_9'] })).toBeNull();
    });
});
