import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { blockFromSelection } from '@/editor/assets/fromSelection';
import { ASSET_LIBRARY, findAsset, forgetAsset, registerAssets } from '@/editor/assets/library';
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
