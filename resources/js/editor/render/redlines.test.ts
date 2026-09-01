import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { diffDocuments } from '@/editor/model/diff';
import { emptyDocument } from '@/editor/model/document';
import { createDoor, createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument } from '@/editor/model/types';
import type { SceneLayer, ScenePrimitive } from '@/editor/scene/types';

import { buildRedlines, type RedlinePalette } from './redlines';

const LAYER = 'layer_architecture';

const PALETTE: RedlinePalette = {
    added: '#008000',
    removed: '#800000',
    changed: '#808000',
};

/** Fixed, so building "the same wall" twice really does build the same wall. */
const MADE_AT = { createdAt: '2026-03-14T09:00:00.000Z' };

function documentWith(elements: Element[]): HashiraDocument {
    return { ...emptyDocument('Ground floor'), id: 'doc', elements };
}

function wall(id: string, thickness = 150): Element {
    return { ...createWall(point(0, 0), point(4000, 0), LAYER, thickness), id, metadata: MADE_AT };
}

function primitives(layers: SceneLayer[]): ScenePrimitive[] {
    return layers.flatMap((layer) => layer.primitives);
}

function strokes(layers: SceneLayer[]): { color: string; dash: number[] | null }[] {
    return primitives(layers).flatMap((primitive) =>
        primitive.kind === 'text' || primitive.stroke === null
            ? []
            : [{ color: primitive.stroke.color, dash: primitive.stroke.dash ?? null }],
    );
}

function redlinesBetween(before: HashiraDocument, after: HashiraDocument): SceneLayer[] {
    return buildRedlines(diffDocuments(before, after), before, after, PALETTE);
}

describe('buildRedlines', () => {
    it('marks nothing when nothing changed', () => {
        const document = documentWith([wall('w1')]);

        expect(redlinesBetween(document, document)).toEqual([]);
    });

    it('draws a deleted element dashed, in the colour for what is gone', () => {
        const marks = redlinesBetween(documentWith([wall('w1')]), documentWith([]));

        expect(marks.length).toBeGreaterThan(0);
        expect(strokes(marks).every((stroke) => stroke.color === PALETTE.removed)).toBe(true);
        expect(strokes(marks).every((stroke) => stroke.dash !== null)).toBe(true);
    });

    it('draws a new element solid, in the colour for what was drawn', () => {
        const marks = redlinesBetween(documentWith([]), documentWith([wall('w1')]));

        expect(strokes(marks).every((stroke) => stroke.color === PALETTE.added)).toBe(true);
        expect(strokes(marks).every((stroke) => stroke.dash === null)).toBe(true);
    });

    it('draws an edit twice: where it was, dashed, and where it is, solid', () => {
        const marks = redlinesBetween(
            documentWith([wall('w1', 150)]),
            documentWith([wall('w1', 400)]),
        );
        const drawn = strokes(marks);

        expect(drawn.every((stroke) => stroke.color === PALETTE.changed)).toBe(true);
        expect(drawn.some((stroke) => stroke.dash !== null)).toBe(true);
        expect(drawn.some((stroke) => stroke.dash === null)).toBe(true);
    });

    it('leaves no fill behind, so a marked wall reads as an outline', () => {
        const marks = redlinesBetween(documentWith([]), documentWith([wall('w1')]));

        for (const primitive of primitives(marks)) {
            // Text is set rather than outlined, and an arc has never had a fill to drop.
            if (primitive.kind === 'text' || primitive.kind === 'arc') continue;

            // An area's fill is not optional, so it is painted in nothing rather than omitted.
            const fill = primitive.kind === 'area' ? primitive.fill : (primitive.fill ?? null);

            expect(fill === null || fill.startsWith('rgba(0, 0, 0, 0')).toBe(true);
        }
    });

    it('marks an opening even though the wall hosting it is not marked', () => {
        const host = wall('w1');
        const door = { ...createDoor('w1', 0, 'layer_openings'), id: 'd1', metadata: MADE_AT };

        // The wall is untouched; only the door is new. Without the whole document to resolve
        // against, a door has no position at all and would be marked as nothing.
        const marks = redlinesBetween(documentWith([host]), documentWith([host, door]));

        expect(primitives(marks).length).toBeGreaterThan(0);
    });

    it('marks a change on a hidden layer, which the drawing itself would not show', () => {
        function withLayerHidden(elements: Element[]): HashiraDocument {
            const document = documentWith(elements);

            return {
                ...document,
                layers: document.layers.map((layer) =>
                    layer.id === LAYER ? { ...layer, visible: false } : layer,
                ),
            };
        }

        // Hidden on both sides, so the only thing that differs is the wall itself.
        const marks = redlinesBetween(
            withLayerHidden([wall('w1', 150)]),
            withLayerHidden([wall('w1', 400)]),
        );

        expect(marks.length).toBeGreaterThan(0);
    });
});
