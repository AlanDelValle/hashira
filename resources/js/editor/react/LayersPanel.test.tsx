import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createWall } from '@/editor/model/factories';
import type { Layer } from '@/editor/model/types';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { LayersPanel } from './LayersPanel';

/**
 * The layers panel, and the line running through it.
 *
 * Visibility, locking and order are **in the document**, so each one is a command and undoes
 * like any other edit — hiding a layer by accident is exactly what Ctrl+Z is for. Which layer
 * is *active* is not: that belongs to the person drawing and is never saved. Those two halves
 * sit in the same list of rows, which is precisely why it is worth holding them apart.
 */

const LAYER = 'layer_architecture';

function open(selection: string[] = []) {
    useDocumentStore.setState({
        document: {
            ...emptyDocument('Ground floor'),
            id: 'doc',
            elements: [{ ...createWall(point(0, 0), point(4000, 0), LAYER), id: 'w1' }],
        },
        dropped: [],
        error: null,
    });

    useEditorStore.setState({ selection, activeLayerId: LAYER });
    history.clear();
}

function layers(): Layer[] {
    return useDocumentStore.getState().document.layers;
}

function named(name: string): Layer {
    const layer = layers().find((candidate) => candidate.name === name);

    if (layer === undefined) {
        throw new Error(`No ${name} layer.`);
    }

    return layer;
}

describe('the layers panel', () => {
    beforeEach(() => open());

    it('lists the drawing’s layers', () => {
        render(<LayersPanel />);

        expect(screen.getByRole('button', { name: 'Architecture' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Annotations' })).toBeInTheDocument();
    });

    it('hides a layer through a command, so it undoes', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        expect(named('Architecture').visible).toBe(false);

        history.undo();

        expect(named('Architecture').visible).toBe(true);
    });

    it('drops the selection when the layer it was on is hidden', async () => {
        const user = userEvent.setup();

        open(['w1']);
        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        // What is on a hidden layer cannot be acted on, so it should not look selected either.
        expect(useEditorStore.getState().selection).toEqual([]);
    });

    it('keeps the selection when a layer is merely shown again', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        useEditorStore.getState().select(['w1']);

        await user.click(screen.getByRole('button', { name: 'Show Architecture' }));

        expect(useEditorStore.getState().selection).toEqual(['w1']);
    });

    it('locks a layer through a command too', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Lock Architecture' }));

        expect(named('Architecture').locked).toBe(true);

        history.undo();

        expect(named('Architecture').locked).toBe(false);
    });

    it('chooses which layer new work lands on without editing the drawing', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Furniture' }));

        expect(useEditorStore.getState().activeLayerId).toBe('layer_furniture');

        // The active layer is not saved, so there is nothing here to undo.
        expect(history.getState().canUndo).toBe(false);
    });

    it('marks the active layer as pressed, for anyone not reading the colour', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);

        expect(screen.getByRole('button', { name: 'Architecture' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        await user.click(screen.getByRole('button', { name: 'Furniture' }));

        expect(screen.getByRole('button', { name: 'Furniture' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('reorders by swapping the order two layers paint in', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);

        expect(layers().map((layer) => layer.name)).toEqual([
            'Architecture',
            'Openings',
            'Furniture',
            'Dimensions',
            'Annotations',
        ]);

        await user.click(screen.getByRole('button', { name: 'Move Openings down' }));

        expect(layers().map((layer) => layer.name)).toEqual([
            'Openings',
            'Architecture',
            'Furniture',
            'Dimensions',
            'Annotations',
        ]);

        // Order is what the renderer reads, not array position — so it has to move with them.
        expect(named('Openings').order).toBe(0);
        expect(named('Architecture').order).toBe(1);
    });

    it('undoes a reorder in one press', async () => {
        const user = userEvent.setup();

        render(<LayersPanel />);
        await user.click(screen.getByRole('button', { name: 'Move Openings down' }));

        history.undo();

        expect(layers().map((layer) => layer.name)[0]).toBe('Architecture');
    });

    it('will not move the bottom layer down or the top one up', () => {
        render(<LayersPanel />);

        expect(screen.getByRole('button', { name: 'Move Architecture down' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move Annotations up' })).toBeDisabled();
    });
});
