import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument, parseDocument } from '@/editor/model/document';
import { createText, DEFAULT_TEXT_SIZE } from '@/editor/model/factories';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { commitText } from './textTool';

function texts() {
    return useDocumentStore
        .getState()
        .document.elements.filter((element) => element.type === 'text');
}

describe('writing a label', () => {
    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({
            tool: 'text',
            selection: [],
            textDraft: null,
            textSize: DEFAULT_TEXT_SIZE,
            activeLayerId: 'layer_architecture',
        });
    });

    it('puts the words where the click was, at the size that was set', () => {
        useEditorStore.setState({ textSize: 400 });

        expect(commitText('Living', point(2700, 3200))).toBe(true);

        const [label] = texts();

        expect(label?.transform).toMatchObject({ x: 2700, y: 3200 });
        expect(label?.type === 'text' && label.geometry).toMatchObject({
            content: 'Living',
            fontSize: 400,
        });
    });

    it('lands on the annotations layer rather than whatever is active', () => {
        commitText('Kitchen', point(0, 0));

        expect(texts()[0]?.layerId).toBe('layer_annotations');
    });

    it('falls back to the active layer when there is no annotations layer', () => {
        const drawing = useDocumentStore.getState().document;

        useDocumentStore.setState({
            document: {
                ...drawing,
                layers: drawing.layers.filter((layer) => layer.id !== 'layer_annotations'),
            },
        });

        commitText('Kitchen', point(0, 0));

        expect(texts()[0]?.layerId).toBe('layer_architecture');
    });

    it('selects what was just written, so it can be moved or reworded straight away', () => {
        commitText('Hall', point(0, 0));

        expect(useEditorStore.getState().selection).toEqual([texts()[0]?.id]);
    });

    it('undoes as one step', () => {
        commitText('Hall', point(0, 0));
        expect(texts()).toHaveLength(1);

        history.undo();

        expect(texts()).toHaveLength(0);
    });

    it('refuses blank, which would be selectable and invisible', () => {
        expect(commitText('', point(0, 0))).toBe(false);
        expect(commitText('   ', point(0, 0))).toBe(false);

        expect(texts()).toHaveLength(0);
    });

    it('trims what was typed', () => {
        commitText('  Living  ', point(0, 0));

        const label = texts()[0];

        expect(label?.type === 'text' && label.geometry.content).toBe('Living');
    });
});

describe('a written label', () => {
    it('is something the document format accepts back', () => {
        const drawing = emptyDocument();
        const label = createText('Living', point(2700, 3200), 'layer_annotations');
        const parsed = parseDocument({ ...drawing, elements: [label] });

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.dropped).toEqual([]);
        expect(parsed.ok && parsed.document.elements[0]).toEqual(label);
    });
});

describe('the draft', () => {
    beforeEach(() => {
        useEditorStore.setState({ tool: 'text', textDraft: null });
    });

    it('gets its own identity, so two labels at the same point are two drafts', () => {
        const store = useEditorStore.getState();

        store.beginText(point(100, 100));
        const first = useEditorStore.getState().textDraft;

        store.beginText(point(100, 100));
        const second = useEditorStore.getState().textDraft;

        expect(first?.id).not.toBe(second?.id);
        expect(second?.at).toEqual(point(100, 100));
    });

    it('is abandoned when the tool is left', () => {
        useEditorStore.getState().beginText(point(100, 100));
        useEditorStore.getState().setTool('select');

        expect(useEditorStore.getState().textDraft).toBeNull();
    });
});
