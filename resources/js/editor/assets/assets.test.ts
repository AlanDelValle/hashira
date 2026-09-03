import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { blockFromSelection } from '@/editor/assets/fromSelection';
import {
    ASSET_CATEGORIES,
    ASSET_LIBRARY,
    findAsset,
    forgetAsset,
    registerAssets,
    type AssetPrimitive,
} from '@/editor/assets/library';
import { importSvg } from '@/editor/assets/svgImport';
import { makeLookup } from '@/editor/model/elements';
import { createAsset, createCircle, createDimension, createRect } from '@/editor/model/factories';

const LAYER = 'layer_furniture';
const NO_LOOKUP = makeLookup([]);

describe('a block made from a selection', () => {
    it('normalises what was drawn into the box the block is placed in', () => {
        const rect = createRect(point(1000, 2000), point(2000, 2500), LAYER);
        const draft = blockFromSelection([rect], NO_LOOKUP);

        expect(draft?.width).toBe(1000);
        expect(draft?.height).toBe(500);

        // The rectangle filled the selection, so it fills the box: corners at 0 and 1.
        const ring = draft?.draw[0];

        expect(ring?.kind).toBe('polyline');
        expect(
            ring?.kind === 'polyline' && ring.points.every((value) => value === 0 || value === 1),
        ).toBe(true);
    });

    it('keeps a circle round by measuring it against both sides of the box', () => {
        const circle = createCircle(point(0, 0), 250, LAYER);
        const draft = blockFromSelection([circle], NO_LOOKUP);
        const ellipse = draft?.draw[0];

        expect(draft?.width).toBe(500);
        expect(ellipse?.kind === 'ellipse' && ellipse.rx).toBeCloseTo(0.5);
        expect(ellipse?.kind === 'ellipse' && ellipse.ry).toBeCloseTo(0.5);
    });

    /*
     * A measurement measures the drawing it was taken from. Scaled into a box and stamped
     * somewhere else it would be a number about nothing, so it is left behind and counted.
     */
    it('leaves measurements and labels out, and says how many', () => {
        const rect = createRect(point(0, 0), point(1000, 1000), LAYER);
        const dimension = createDimension([point(0, 0), point(1000, 0)], 200, 'layer_dimensions');
        const draft = blockFromSelection([rect, dimension], NO_LOOKUP);

        expect(draft?.draw).toHaveLength(1);
        expect(draft?.ignored).toBe(1);
    });

    it('has nothing to make when the selection is all annotation', () => {
        const dimension = createDimension([point(0, 0), point(1000, 0)], 200, 'layer_dimensions');

        expect(blockFromSelection([dimension], NO_LOOKUP)).toBeNull();
    });

    /*
     * A block that referred to another block would break the moment the other were deleted,
     * so the one inside is flattened into the one being made.
     */
    it('flattens a block that was part of the selection', () => {
        const sofa = ASSET_LIBRARY.find((asset) => asset.id === 'sofa-2');
        const placed = createAsset(sofa!, point(0, 0));
        const draft = blockFromSelection([placed], NO_LOOKUP);

        expect(draft?.draw).toHaveLength(sofa!.draw.length);
        expect(draft?.draw.some((primitive) => primitive.kind === 'rect')).toBe(false);
    });
});

describe('a block imported from an SVG', () => {
    it('reads shapes, and its size from the file', () => {
        const result = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600mm" height="400mm" viewBox="0 0 60 40">' +
                '<rect x="0" y="0" width="60" height="40"/>' +
                '<line x1="0" y1="20" x2="60" y2="20"/>' +
                '</svg>',
        );

        expect(result.ok).toBe(true);
        expect(result.ok && result.width).toBe(600);
        expect(result.ok && result.height).toBe(400);
        expect(result.ok && result.draw).toHaveLength(2);

        const line = result.ok ? result.draw[1] : undefined;

        expect(line?.kind === 'line' && line.y1).toBeCloseTo(0.5);
    });

    it('carries a group transform down into the shapes inside it', () => {
        const result = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
                '<g transform="translate(50 0)"><line x1="0" y1="0" x2="0" y2="100"/></g>' +
                '</svg>',
        );

        const line = result.ok ? result.draw[0] : undefined;

        expect(line?.kind === 'line' && line.x1).toBeCloseTo(0.5);
    });

    it('flattens a curve into a line it can actually draw', () => {
        const result = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
                '<path d="M 0 100 C 0 0 100 0 100 100 Z"/>' +
                '</svg>',
        );

        const path = result.ok ? result.draw[0] : undefined;

        expect(path?.kind).toBe('polyline');
        expect(path?.kind === 'polyline' && path.closed).toBe(true);
        expect(path?.kind === 'polyline' && path.points.length).toBeGreaterThan(8);
    });

    it('refuses a file with nothing in it to draw', () => {
        const result = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><title>Nothing</title></svg>',
        );

        expect(result.ok).toBe(false);
        expect(!result.ok && result.reason).toContain('no shapes');
    });

    it('refuses something that is not an SVG at all', () => {
        expect(importSvg('this is not a drawing').ok).toBe(false);
    });

    it('leaves out what a block cannot say — the drawing, not the styling', () => {
        const result = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
                '<defs><rect x="0" y="0" width="10" height="10"/></defs>' +
                '<text x="1" y="1">Sofa</text>' +
                '<circle cx="5" cy="5" r="4" fill="red" stroke="blue"/>' +
                '</svg>',
        );

        // The circle, and only the circle: what is in defs is referred to rather than drawn,
        // and a block has no text.
        expect(result.ok && result.draw).toHaveLength(1);
    });
});

describe('blocks somebody made', () => {
    it('are resolved by the same lookup the built-in ones are', () => {
        registerAssets([
            {
                id: 'mine',
                name: 'Desk',
                category: 'tables',
                width: 1400,
                height: 700,
                layerId: LAYER,
                draw: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }],
            },
        ]);

        expect(findAsset('mine')?.name).toBe('Desk');
        expect(findAsset('mine')?.own).toBe(true);
        expect(findAsset('sofa-2')?.own).toBeUndefined();

        forgetAsset('mine');

        expect(findAsset('mine')).toBeUndefined();
    });
});

/**
 * The library, held to its own rules.
 *
 * Thirty-nine blocks could be read through; a hundred and nine cannot, and the mistakes that
 * matter are the dull ones — a coordinate typed in millimetres instead of box space, a name
 * pasted over an id already in use, a category that does not exist and therefore a shelf that
 * never appears. None of those break a build and all of them are invisible until somebody goes
 * looking for a block that is not where it should be.
 */
describe('the blocks that ship with the editor', () => {
    const KNOWN_LAYERS = ['layer_architecture', 'layer_furniture', 'layer_annotations'];

    /** Every coordinate a primitive puts in the box, whatever kind it is. */
    function coordinates(primitive: AssetPrimitive): number[] {
        switch (primitive.kind) {
            case 'rect':
                return [
                    primitive.x,
                    primitive.y,
                    primitive.x + primitive.w,
                    primitive.y + primitive.h,
                ];
            case 'line':
                return [primitive.x1, primitive.y1, primitive.x2, primitive.y2];
            case 'polyline':
                return [...primitive.points];
            case 'ellipse':
                return [
                    primitive.cx - primitive.rx,
                    primitive.cy - primitive.ry,
                    primitive.cx + primitive.rx,
                    primitive.cy + primitive.ry,
                ];
            case 'arc': {
                // The arc itself, not the whole circle it is struck from: a quarter arc taken
                // out of a corner of the box stays inside it, and a bounding circle would call
                // that a mistake. Sixteen steps is far finer than the tenth being checked.
                const steps = 16;
                const along: number[] = [];

                for (let step = 0; step <= steps; step++) {
                    const angle = primitive.from + ((primitive.to - primitive.from) * step) / steps;

                    along.push(primitive.cx + Math.cos(angle) * primitive.r);
                    along.push(primitive.cy + Math.sin(angle) * primitive.r);
                }

                return along;
            }
        }
    }

    it('gives every block an id of its own', () => {
        const ids = ASSET_LIBRARY.map((asset) => asset.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('files every block on a shelf that exists', () => {
        const shelves = new Set(ASSET_CATEGORIES.map((entry) => entry.id));
        const orphans = ASSET_LIBRARY.filter((asset) => !shelves.has(asset.category));

        expect(orphans.map((asset) => asset.id)).toEqual([]);
    });

    it('leaves no shelf empty, because an empty one is a heading and nothing else', () => {
        const used = new Set(ASSET_LIBRARY.map((asset) => asset.category));
        const bare = ASSET_CATEGORIES.filter((entry) => !used.has(entry.id));

        expect(bare.map((entry) => entry.id)).toEqual([]);
    });

    it('puts every block on a layer a new drawing actually has', () => {
        const stray = ASSET_LIBRARY.filter((asset) => !KNOWN_LAYERS.includes(asset.layerId));

        expect(stray.map((asset) => asset.id)).toEqual([]);
    });

    it('gives every block a real size and something to draw', () => {
        for (const asset of ASSET_LIBRARY) {
            expect(asset.width, asset.id).toBeGreaterThan(0);
            expect(asset.height, asset.id).toBeGreaterThan(0);
            expect(asset.name.length, asset.id).toBeGreaterThan(0);
            expect(asset.draw.length, asset.id).toBeGreaterThan(0);
        }
    });

    /*
     * Held to the box within a tenth rather than exactly. A mark may lean a little past its own
     * size on purpose — the north point's circle does — and the thing worth catching is not the
     * overhang but a coordinate that was never in box space at all: a 500 that should have been
     * a 0.5, or a stray minus.
     */
    it('draws every block in the box it is placed in', () => {
        for (const asset of ASSET_LIBRARY) {
            for (const value of asset.draw.flatMap(coordinates)) {
                expect(Number.isFinite(value), asset.id).toBe(true);
                expect(value, asset.id).toBeGreaterThanOrEqual(-0.1);
                expect(value, asset.id).toBeLessThanOrEqual(1.1);
            }
        }
    });
});
