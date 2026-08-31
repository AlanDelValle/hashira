import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { dimensionFrame } from '@/editor/model/elements';
import { DEFAULT_DIMENSION_SIZE } from '@/editor/model/factories';
import type { DimensionElement } from '@/editor/model/types';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { commitDimension } from './measureTools';

function dimensions(): DimensionElement[] {
    return useDocumentStore
        .getState()
        .document.elements.filter((element) => element.type === 'dimension');
}

describe('measuring', () => {
    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({
            tool: 'dimension',
            selection: [],
            dimensionSize: DEFAULT_DIMENSION_SIZE,
            activeLayerId: 'layer_architecture',
        });
    });

    it('measures what is between the two points', () => {
        commitDimension(point(0, 0), point(6000, 0), 800);

        expect(dimensionFrame(dimensions()[0]!)?.length).toBe(6000);
    });

    it('lands on the dimensions layer rather than whatever is active', () => {
        commitDimension(point(0, 0), point(1000, 0), 0);

        expect(dimensions()[0]?.layerId).toBe('layer_dimensions');
    });

    it('falls back to the active layer when there is no dimensions layer', () => {
        const drawing = useDocumentStore.getState().document;

        useDocumentStore.setState({
            document: {
                ...drawing,
                layers: drawing.layers.filter((layer) => layer.id !== 'layer_dimensions'),
            },
        });

        commitDimension(point(0, 0), point(1000, 0), 0);

        expect(dimensions()[0]?.layerId).toBe('layer_architecture');
    });

    it('keeps the side the offset was pulled to', () => {
        commitDimension(point(0, 0), point(1000, 0), -500);

        expect(dimensions()[0]?.geometry.offset).toBe(-500);
    });

    it('refuses to measure a point against itself', () => {
        expect(commitDimension(point(500, 500), point(500, 500), 100)).toBeNull();
        expect(dimensions()).toHaveLength(0);
    });

    it('selects what was just measured', () => {
        const id = commitDimension(point(0, 0), point(1000, 0), 0);

        expect(useEditorStore.getState().selection).toEqual([id]);
    });

    it('undoes as one step', () => {
        commitDimension(point(0, 0), point(1000, 0), 0);
        expect(dimensions()).toHaveLength(1);

        history.undo();

        expect(dimensions()).toHaveLength(0);
    });

    it('writes at the size the panel is set to', () => {
        useEditorStore.setState({ dimensionSize: 350 });
        commitDimension(point(0, 0), point(1000, 0), 0);

        expect(dimensions()[0]?.geometry.fontSize).toBe(350);
    });
});
