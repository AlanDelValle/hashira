import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';

import { conventionsUsed } from './conventions';
import { createCircle, createLine, createRect, createWall } from './factories';
import type { Element } from './types';

const LAYER = 'layer_architecture';
const OTHER = 'layer_annotations';
const BOTH = new Set([LAYER, OTHER]);

function line(layerId = LAYER): Element {
    return createLine(point(0, 0), point(3000, 0), layerId);
}

function wall(layerId = LAYER): Element {
    return createWall(point(0, 0), point(4000, 0), layerId, 200);
}

describe('what a drawing is read by', () => {
    it('says nothing about a drawing that has marked nothing', () => {
        expect(conventionsUsed([wall(), line()], BOTH)).toEqual([]);
    });

    /*
     * Absent means contínua larga, which is what these shapes are drawn as anyway. A reader
     * meeting a plain continuous line is not looking anything up, and naming it in the key
     * would be the same mistake as storing it on the element.
     */
    it('does not name the line type nobody chose', () => {
        const named = { ...line(), style: { lineType: 'dashed-narrow' as const } };

        expect(conventionsUsed([line(), named], BOTH)).toEqual([
            { kind: 'line', id: 'dashed-narrow', name: 'Hidden edges' },
        ]);
    });

    it('names a hatch by what it is and a line by what it is for', () => {
        const hatched = { ...wall(), style: { hatch: 'demolish' as const } };
        const dashed = { ...line(), style: { lineType: 'dash-dot-narrow' as const } };

        expect(conventionsUsed([hatched, dashed], BOTH)).toEqual([
            { kind: 'hatch', id: 'demolish', name: 'To demolish' },
            { kind: 'line', id: 'dash-dot-narrow', name: 'Centre lines and symmetry' },
        ]);
    });

    it('lists each convention once however many elements carry it', () => {
        const one = { ...wall(), style: { hatch: 'new' as const } };
        const two = { ...wall(), style: { hatch: 'new' as const } };

        expect(conventionsUsed([one, two], BOTH)).toHaveLength(1);
    });

    /*
     * Catalogue order rather than order of appearance, so the same drawing prints the same key
     * twice running and two sheets of one set can be read against each other.
     */
    it('lists them in the order the catalogues do, whatever order they were drawn in', () => {
        const late = { ...wall(), style: { hatch: 'earth' as const } };
        const early = { ...wall(), style: { hatch: 'existing' as const } };
        const dashed = { ...line(), style: { lineType: 'long-dash-dot-narrow' as const } };
        const centre = { ...line(), style: { lineType: 'dashed-narrow' as const } };

        expect(conventionsUsed([late, dashed, early, centre], BOTH).map((e) => e.id)).toEqual([
            'existing',
            'earth',
            'dashed-narrow',
            'long-dash-dot-narrow',
        ]);
    });

    /*
     * A key naming a mark that is not on the sheet is worse than no key. The scene paints a
     * hatch on what encloses an area and a line type on what somebody drew for its own sake,
     * so a convention that reached an element by any other route is not explained here either.
     */
    it('ignores a convention on an element nothing paints it on', () => {
        const linedWall = { ...wall(), style: { lineType: 'dashed-narrow' as const } };
        const hatchedLine = { ...line(), style: { hatch: 'concrete' as const } };

        expect(conventionsUsed([linedWall, hatchedLine], BOTH)).toEqual([]);
    });

    it('takes both from a shape that carries both', () => {
        const shape = {
            ...createRect(point(0, 0), point(2000, 1000), LAYER),
            style: { hatch: 'steel' as const, lineType: 'dashed-narrow' as const },
        };

        expect(conventionsUsed([shape], BOTH).map((entry) => entry.id)).toEqual([
            'steel',
            'dashed-narrow',
        ]);
    });

    /*
     * A page printed as one layer is a drawing of one layer, and its key explains that layer's
     * marks and no others — the same rule the layer legend beside it already follows.
     */
    it('explains only the layers the page is a drawing of', () => {
        const here = { ...wall(LAYER), style: { hatch: 'concrete' as const } };
        const elsewhere = {
            ...createCircle(point(0, 0), 500, OTHER),
            style: { hatch: 'steel' as const },
        };

        expect(conventionsUsed([here, elsewhere], new Set([LAYER])).map((e) => e.id)).toEqual([
            'concrete',
        ]);
    });
});
