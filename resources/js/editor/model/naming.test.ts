import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';

import { makeLookup } from './elements';
import {
    createAsset,
    createDoor,
    createLine,
    createRoom,
    createText,
    createWall,
} from './factories';
import { findAsset } from '@/editor/assets/library';
import { elementName, isNamed } from './naming';
import type { Element } from './types';

const LAYER = 'layer_architecture';
const NONE = makeLookup([]);

function name(element: Element, lookup = NONE): string {
    return elementName(element, lookup, 'm');
}

/**
 * A tree has to name several hundred rows and the format holds a name for none of them, so a
 * name is worked out from what the element is — the same reasoning that keeps a dimension from
 * storing its value. Nothing here is written to the document.
 */
describe('what an element calls itself', () => {
    it('lets a label speak for itself', () => {
        const label = createText('Bedroom', point(0, 0), LAYER);

        expect(name(label)).toBe('Bedroom');
    });

    it('cuts a note down to a row rather than letting it wrap', () => {
        const long = createText('a'.repeat(90), point(0, 0), LAYER);

        expect(name(long)).toHaveLength(40);
        expect(name(long).endsWith('…')).toBe(true);
    });

    it('falls back to the type when the words are blank', () => {
        expect(name(createText('   ', point(0, 0), LAYER))).toBe('Text');
    });

    it('names a wall and a line by how long they are', () => {
        expect(name(createWall(point(0, 0), point(3200, 0), LAYER))).toBe('Wall · 3.200 m');
        expect(name(createLine(point(0, 0), point(1000, 0), LAYER))).toBe('Line · 1.000 m');
    });

    it('names a room by the area it measures', () => {
        const room = createRoom(
            [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
            LAYER,
        );

        expect(room === null ? '' : name(room)).toBe('Room · 12.00 m²');
    });

    /*
     * By how it operates rather than by the word "door": on a list of twenty openings,
     * "Sliding · 0.900 m" is the row somebody is actually looking for.
     */
    it('names a door by how it opens', () => {
        const sliding = createDoor('w1', 0, LAYER, { leaf: 'sliding' });
        const gate = createDoor('w1', 0, LAYER, { leaf: 'gate' });

        expect(name(sliding)).toBe('Sliding · 0.900 m');
        expect(name(gate)).toBe('Gate · 1.000 m');
    });

    it('names a block by the block', () => {
        const sofa = findAsset('sofa-3');

        expect(sofa === undefined ? '' : name(createAsset(sofa, point(0, 0)))).toBe('Sofa, 3 seat');
    });

    it('names a block nobody can resolve by what it is', () => {
        const stray: Element = {
            ...createAsset(
                {
                    id: 'x',
                    name: 'x',
                    category: 'seating',
                    width: 1,
                    height: 1,
                    layerId: LAYER,
                    draw: [],
                },
                point(0, 0),
            ),
            geometry: { assetId: 'gone', width: 100, height: 100, mirrored: false },
        };

        expect(name(stray)).toBe('Block');
    });

    it('prefers a name somebody typed over the one it worked out', () => {
        const wall = createWall(point(0, 0), point(3200, 0), LAYER);
        const named: Element = { ...wall, metadata: { label: 'Party wall' } };

        expect(name(named)).toBe('Party wall');
        expect(isNamed(named)).toBe(true);
        expect(isNamed(wall)).toBe(false);
    });

    it('goes back to the derived name when the typed one is emptied', () => {
        const wall = createWall(point(0, 0), point(3200, 0), LAYER);

        expect(name({ ...wall, metadata: { label: '  ' } })).toBe('Wall · 3.200 m');
    });
});
