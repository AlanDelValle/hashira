import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { createRoom, createWall } from '@/editor/model/factories';
import type { Element, HatchPattern } from '@/editor/model/types';

import { buildScene } from './build';
import type { ScenePrimitive } from './types';

const PALETTE = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc', sheet: '#ffffff' };
const LAYER = 'layer_architecture';

/** What a shape is painted is its layer's colour, not the palette's ink. */
const INK = defaultLayers().find((layer) => layer.id === LAYER)?.color ?? '';

/** A wall with a known id and, when it is asked for, a pattern filling it. */
function wall(id: string, a: [number, number], b: [number, number], hatch?: HatchPattern) {
    const made = { ...createWall(point(...a), point(...b), LAYER, 200), id };

    return hatch === undefined ? made : { ...made, style: { hatch } };
}

function primitives(elements: Element[], scale = 50): ScenePrimitive[] {
    return buildScene(elements, defaultLayers(), { palette: PALETTE, scale }).flatMap(
        (layer) => layer.primitives,
    );
}

describe('a shape filled with a hatch', () => {
    function room(): Element {
        const made = createRoom(
            [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
            LAYER,
        );

        if (made === null) {
            throw new Error('four corners are a room');
        }

        return made;
    }

    it('leaves a wall solid when nothing is asked for', () => {
        const made = primitives([wall('one', [0, 0], [4000, 0])]);

        expect(made).toHaveLength(1);
        expect(made[0]?.kind).toBe('area');
        expect(made[0]?.kind === 'area' && made[0].fill).toBe(INK);
    });

    /*
     * Existing masonry is solid, which is what a wall already was — so saying so changes
     * nothing on the sheet, and the drawing gains a statement rather than a mark.
     */
    it('leaves it solid when it is marked as existing', () => {
        const made = primitives([wall('one', [0, 0], [4000, 0], 'existing')]);

        expect(made).toHaveLength(1);
        expect(made[0]?.kind === 'area' && made[0].fill).toBe(INK);
    });

    it('draws masonry coming out as an open band', () => {
        const made = primitives([wall('one', [0, 0], [4000, 0], 'demolish')]);

        // The paper behind it and an outline round it, and nothing inside: what is being taken
        // away is left white so that what is staying reads solid beside it.
        expect(made).toHaveLength(1);
        expect(made[0]?.kind === 'area' && made[0].fill).toBe(PALETTE.sheet);
        expect(made[0]?.kind === 'area' && made[0].stroke).not.toBeNull();
    });

    it('fills masonry going in with lines', () => {
        const made = primitives([wall('one', [0, 0], [4000, 0], 'new')]);
        const lines = made.filter((primitive) => primitive.kind === 'polyline');

        expect(lines.length).toBeGreaterThan(5);
        expect(made[0]?.kind === 'area' && made[0].fill).toBe(PALETTE.sheet);
    });

    it('speckles concrete, and speckles it the same way twice', () => {
        const once = primitives([wall('one', [0, 0], [4000, 0], 'concrete')]);
        const again = primitives([wall('one', [0, 0], [4000, 0], 'concrete')]);

        expect(once.filter((primitive) => primitive.kind === 'circle').length).toBeGreaterThan(20);
        expect(once).toEqual(again);
    });

    it('hatches a room as readily as a wall, since a hatch belongs to the shape', () => {
        const plain = primitives([room()]);
        const earthed = primitives([{ ...room(), style: { hatch: 'earth' } }]);

        expect(plain).toHaveLength(1);
        expect(earthed.length).toBeGreaterThan(1);
    });

    it('scales the spacing with the plot, because a hatch is specified on the sheet', () => {
        const fifty = primitives([wall('one', [0, 0], [4000, 0], 'new')]).length;
        const hundred = primitives([wall('one', [0, 0], [4000, 0], 'new')], 100).length;

        // Twice the ratio is twice the world spacing, so about half as many lines in the wall.
        expect(hundred).toBeLessThan(fifty);
    });
});

describe('walls filled differently', () => {
    /*
     * Walls are merged into one shape so that two fills sharing an edge do not leave a seam at
     * every mitre. Merging a run coming down with a run staying up would say they were the same
     * masonry, which is the one thing a renovation drawing exists to distinguish.
     */
    it('are not merged into one another', () => {
        const made = primitives([
            wall('staying', [0, 0], [4000, 0], 'existing'),
            wall('going', [4000, 0], [4000, 3000], 'demolish'),
        ]);

        const areas = made.filter((primitive) => primitive.kind === 'area');

        expect(areas).toHaveLength(2);
        expect(areas.map((area) => area.kind === 'area' && area.fill).sort()).toEqual(
            [INK, PALETTE.sheet].sort(),
        );
    });

    it('are merged when they say the same thing', () => {
        const made = primitives([
            wall('one', [0, 0], [4000, 0], 'demolish'),
            wall('two', [4000, 0], [4000, 3000], 'demolish'),
        ]);

        expect(made.filter((primitive) => primitive.kind === 'area')).toHaveLength(1);
    });
});
