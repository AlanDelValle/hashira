import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { DEFAULT_TEXT_SIZE } from '@/editor/model/factories';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';

import { TextDraft } from './TextDraft';

function labels() {
    return useDocumentStore
        .getState()
        .document.elements.filter((element) => element.type === 'text');
}

describe('the label field', () => {
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

        useViewportStore.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    });

    it('is not there until somebody clicks with the text tool', () => {
        render(<TextDraft />);

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('takes what is typed and writes it onto the drawing on Enter', async () => {
        const user = userEvent.setup();

        render(<TextDraft />);
        act(() => useEditorStore.getState().beginText(point(500, 400)));

        await user.type(await screen.findByRole('textbox'), 'Living{Enter}');

        const label = labels()[0];

        expect(label?.type === 'text' && label.geometry.content).toBe('Living');
        expect(label?.transform).toMatchObject({ x: 500, y: 400 });
        expect(useEditorStore.getState().textDraft).toBeNull();
    });

    it('throws the draft away on Escape', async () => {
        const user = userEvent.setup();

        render(<TextDraft />);
        act(() => useEditorStore.getState().beginText(point(0, 0)));

        await user.type(await screen.findByRole('textbox'), 'Never{Escape}');

        expect(labels()).toHaveLength(0);
        expect(useEditorStore.getState().textDraft).toBeNull();
    });

    it('sits where the point will be, at the size the label will be', async () => {
        useEditorStore.setState({ textSize: 250 });
        useViewportStore.setState({ viewport: { x: 100, y: 50, zoom: 0.2 } });

        render(<TextDraft />);
        act(() => useEditorStore.getState().beginText(point(600, 550)));

        const field = await screen.findByRole('textbox');

        // (600 - 100) * 0.2 and (550 - 50) * 0.2, the same transform the renderer uses.
        expect(field.style.left).toBe('100px');
        expect(field.style.top).toBe('100px');
        expect(field.style.fontSize).toBe('50px');
    });

    it('stays readable when the drawing is zoomed far out', async () => {
        useEditorStore.setState({ textSize: 250 });
        useViewportStore.setState({ viewport: { x: 0, y: 0, zoom: 0.01 } });

        render(<TextDraft />);
        act(() => useEditorStore.getState().beginText(point(0, 0)));

        expect((await screen.findByRole('textbox')).style.fontSize).toBe('11px');
    });

    it('starts empty for the next label rather than keeping the last one', async () => {
        const user = userEvent.setup();

        render(<TextDraft />);

        act(() => useEditorStore.getState().beginText(point(0, 0)));
        await user.type(await screen.findByRole('textbox'), 'First{Enter}');

        act(() => useEditorStore.getState().beginText(point(1000, 0)));

        expect(await screen.findByRole('textbox')).toHaveValue('');
    });
});
