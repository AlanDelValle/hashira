import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';

import { changeBounds, diffDocuments } from './diff';
import { emptyDocument } from './document';
import { makeLookup } from './elements';
import { createLine, createWall } from './factories';
import type { Element, HashiraDocument, Layer } from './types';

const LAYER = 'layer_architecture';

/**
 * A fixed creation time.
 *
 * The factories stamp one on, so building "the same wall" twice would otherwise produce two
 * elements differing by a millisecond — which the comparison would be quite right to report.
 */
const MADE_AT = { createdAt: '2026-03-14T09:00:00.000Z' };

function documentWith(elements: Element[]): HashiraDocument {
    return { ...emptyDocument('Ground floor'), id: 'doc', elements };
}

/** A wall with a fixed id, so two documents can be about the same one. */
function wall(id: string, from = point(0, 0), to = point(4000, 0), thickness = 150): Element {
    return { ...createWall(from, to, LAYER, thickness), id, metadata: MADE_AT };
}

function line(id: string, from = point(0, 0), to = point(1000, 1000)): Element {
    return { ...createLine(from, to, LAYER), id, metadata: MADE_AT };
}

function layerNamed(document: HashiraDocument, id: string): Layer {
    const layer = document.layers.find((candidate) => candidate.id === id);

    if (layer === undefined) {
        throw new Error(`No ${id} layer in the default set.`);
    }

    return layer;
}

describe('diffDocuments', () => {
    it('finds nothing between a document and itself', () => {
        const document = documentWith([wall('w1'), line('l1')]);
        const diff = diffDocuments(document, document);

        expect(diff.empty).toBe(true);
        expect(diff.elements).toEqual([]);
        expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0 });
    });

    it('reports an element that was drawn', () => {
        const before = documentWith([wall('w1')]);
        const after = documentWith([wall('w1'), line('l1')]);

        const diff = diffDocuments(before, after);

        expect(diff.counts).toEqual({ added: 1, removed: 0, changed: 0 });
        expect(diff.elements).toHaveLength(1);
        expect(diff.elements[0]?.kind).toBe('added');
        expect(diff.elements[0]?.id).toBe('l1');
        expect(diff.elements[0]?.before).toBeNull();
    });

    it('reports an element that was deleted, and keeps what it was', () => {
        const removed = wall('w2', point(0, 0), point(0, 3000));
        const before = documentWith([wall('w1'), removed]);
        const after = documentWith([wall('w1')]);

        const diff = diffDocuments(before, after);

        expect(diff.counts).toEqual({ added: 0, removed: 1, changed: 0 });
        expect(diff.elements[0]?.kind).toBe('removed');
        expect(diff.elements[0]?.before).toEqual(removed);
        expect(diff.elements[0]?.after).toBeNull();
    });

    it('names the part of an element that changed', () => {
        // Thickened in place: the shape differs, and nothing else does.
        const before = documentWith([wall('w1', point(0, 0), point(4000, 0), 150)]);
        const after = documentWith([wall('w1', point(0, 0), point(4000, 0), 300)]);

        const diff = diffDocuments(before, after);

        expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1 });
        expect(diff.elements[0]?.fields).toEqual(['geometry']);
    });

    it('separates moving something from reshaping it', () => {
        const original = wall('w1');
        const before = documentWith([original]);
        const after = documentWith([
            { ...original, transform: { ...original.transform, x: original.transform.x + 500 } },
        ]);

        expect(diffDocuments(before, after).elements[0]?.fields).toEqual(['transform']);
    });

    it('reports a move to another layer as a layer change', () => {
        const original = wall('w1');
        const before = documentWith([original]);
        const after = documentWith([{ ...original, layerId: 'layer_annotations' }]);

        expect(diffDocuments(before, after).elements[0]?.fields).toEqual(['layerId']);
    });

    it('does not read an absent optional field as an edit', () => {
        const original = wall('w1');
        const { style: _unused, ...withoutStyle } = { ...original, style: undefined };
        const before = documentWith([original]);
        const after = documentWith([withoutStyle]);

        expect(diffDocuments(before, after).empty).toBe(true);
    });

    it('reads an explicit null as different from an absent field', () => {
        const original = wall('w1');
        const before = documentWith([original]);
        const after = documentWith([{ ...original, style: { fill: null } }]);

        expect(diffDocuments(before, after).elements[0]?.fields).toEqual(['style']);
    });

    it('reports restacking two elements, which no element records', () => {
        const a = wall('w1');
        const b = line('l1');

        const diff = diffDocuments(documentWith([a, b]), documentWith([b, a]));

        expect(diff.reordered).toBe(true);
        expect(diff.elements).toEqual([]);
        expect(diff.empty).toBe(false);
    });

    it('does not call deleting one of three a reordering of the other two', () => {
        const a = wall('w1');
        const b = line('l1');
        const c = line('l2', point(0, 0), point(2000, 0));

        const diff = diffDocuments(documentWith([a, b, c]), documentWith([a, c]));

        expect(diff.reordered).toBe(false);
        expect(diff.counts.removed).toBe(1);
    });

    it('reports a renamed, hidden or recoloured layer', () => {
        const before = documentWith([]);
        const architecture = layerNamed(before, LAYER);

        const after: HashiraDocument = {
            ...before,
            layers: before.layers.map((layer) =>
                layer.id === LAYER ? { ...architecture, name: 'Shell', visible: false } : layer,
            ),
        };

        const diff = diffDocuments(before, after);

        expect(diff.layers).toHaveLength(1);
        expect(diff.layers[0]?.kind).toBe('changed');
        expect(diff.layers[0]?.fields).toEqual(['name', 'visible']);
    });

    it('reports a layer that was deleted', () => {
        const before = documentWith([]);
        const after: HashiraDocument = {
            ...before,
            layers: before.layers.filter((layer) => layer.id !== 'layer_annotations'),
        };

        const diff = diffDocuments(before, after);

        expect(diff.layers).toHaveLength(1);
        expect(diff.layers[0]?.kind).toBe('removed');
        expect(diff.layers[0]?.id).toBe('layer_annotations');
    });

    it('reports a setting that changed, and says which', () => {
        const before = documentWith([]);
        const after: HashiraDocument = {
            ...before,
            settings: { ...before.settings, scale: 100 },
        };

        const diff = diffDocuments(before, after);

        expect(diff.settings).toEqual([
            { key: 'scale', before: before.settings.scale, after: 100 },
        ]);
        expect(diff.empty).toBe(false);
    });

    it('reports the drawing being renamed', () => {
        const before = documentWith([]);
        const after: HashiraDocument = { ...before, name: 'First floor' };

        expect(diffDocuments(before, after).name).toEqual({
            before: 'Ground floor',
            after: 'First floor',
        });
    });

    it('lists what is there now before what is gone', () => {
        const kept = wall('w1');
        const gone = line('l1');
        const drawn = line('l2', point(5000, 0), point(6000, 0));

        const diff = diffDocuments(documentWith([kept, gone]), documentWith([kept, drawn]));

        expect(diff.elements.map((change) => change.kind)).toEqual(['added', 'removed']);
    });
});

describe('changeBounds', () => {
    it('frames where a moved element was and where it went', () => {
        const original = wall('w1', point(0, 0), point(4000, 0));
        const moved = { ...original, transform: { ...original.transform, y: 3000 } };

        const diff = diffDocuments(documentWith([original]), documentWith([moved]));
        const change = diff.elements[0];

        if (change === undefined) throw new Error('expected a change');

        const bounds = changeBounds(change, makeLookup([original]), makeLookup([moved]));

        expect(bounds).not.toBeNull();
        expect(bounds?.minY).toBeLessThan(0);
        expect(bounds?.maxY).toBeGreaterThan(2900);
    });

    it('frames a deleted element from the version it was still in', () => {
        const gone = wall('w1', point(0, 0), point(4000, 0));
        const diff = diffDocuments(documentWith([gone]), documentWith([]));
        const change = diff.elements[0];

        if (change === undefined) throw new Error('expected a change');

        expect(changeBounds(change, makeLookup([gone]), makeLookup([]))).not.toBeNull();
    });
});
