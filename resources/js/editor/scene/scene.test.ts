import { describe, expect, it } from 'vitest';

import { findAsset } from '@/editor/assets/library';
import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { createAsset } from '@/editor/model/factories';
import type { AssetElement } from '@/editor/model/types';

import { buildScene } from './build';
import type { ScenePalette, ScenePrimitive } from './types';

const PALETTE: ScenePalette = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc' };

function primitivesOf(element: AssetElement): ScenePrimitive[] {
    return buildScene([element], defaultLayers(), { palette: PALETTE }).flatMap(
        (layer) => layer.primitives,
    );
}

function block(assetId: string, rotation: number, mirrored = false): AssetElement {
    const element = createAsset(findAsset(assetId)!, point(0, 0));

    return {
        ...element,
        transform: { ...element.transform, rotation },
        geometry: { ...element.geometry, mirrored },
    };
}

describe('library blocks', () => {
    // The bowl of a WC, a basin or a bidet is an ellipse, and an ellipse used to be emitted
    // axis-aligned however the block was turned: the cistern rotated and the bowl did not.
    it('turns an ellipse with the block that contains it', () => {
        const angle = toRadians(30);
        const ellipses = primitivesOf(block('bidet', angle)).filter((p) => p.kind === 'ellipse');

        expect(ellipses).toHaveLength(1);
        expect(ellipses[0]!.rotation).toBeCloseTo(angle);
    });

    it('leaves an ellipse alone when the block is not turned', () => {
        const ellipses = primitivesOf(block('basin', 0)).filter((p) => p.kind === 'ellipse');

        expect(ellipses[0]!.rotation).toBe(0);
    });

    // Reflecting about the block's vertical axis maps the ellipse's own x axis onto itself,
    // so the angle is unchanged — but every point of the drawing still has to move.
    it('mirrors a block without twisting its ellipses', () => {
        const angle = toRadians(45);
        const ellipses = primitivesOf(block('wc', angle, true)).filter((p) => p.kind === 'ellipse');

        expect(ellipses[0]!.rotation).toBeCloseTo(angle);
    });

    it('mirrors an arc by reflecting both of its ends', () => {
        const arcs = primitivesOf(block('plant', 0, true)).filter((p) => p.kind === 'arc');
        const original = primitivesOf(block('plant', 0)).filter((p) => p.kind === 'arc');

        expect(arcs).toHaveLength(original.length);
        expect(arcs[0]!.from).toBeCloseTo(Math.PI - original[0]!.to);
        expect(arcs[0]!.to).toBeCloseTo(Math.PI - original[0]!.from);
    });
});
