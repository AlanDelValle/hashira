import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createText, createWall } from '@/editor/model/factories';
import type { Layer } from '@/editor/model/types';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { SceneTree } from './SceneTree';

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

describe('the scene tree', () => {
    beforeEach(() => open());

    it('lists the drawing’s layers', () => {
        render(<SceneTree />);

        expect(screen.getByRole('button', { name: 'Architecture' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Annotations' })).toBeInTheDocument();
    });

    it('hides a layer through a command, so it undoes', async () => {
        const user = userEvent.setup();

        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        expect(named('Architecture').visible).toBe(false);

        history.undo();

        expect(named('Architecture').visible).toBe(true);
    });

    it('drops the selection when the layer it was on is hidden', async () => {
        const user = userEvent.setup();

        open(['w1']);
        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        // What is on a hidden layer cannot be acted on, so it should not look selected either.
        expect(useEditorStore.getState().selection).toEqual([]);
    });

    it('keeps the selection when a layer is merely shown again', async () => {
        const user = userEvent.setup();

        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Hide Architecture' }));

        useEditorStore.getState().select(['w1']);

        await user.click(screen.getByRole('button', { name: 'Show Architecture' }));

        expect(useEditorStore.getState().selection).toEqual(['w1']);
    });

    it('locks a layer through a command too', async () => {
        const user = userEvent.setup();

        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Lock Architecture' }));

        expect(named('Architecture').locked).toBe(true);

        history.undo();

        expect(named('Architecture').locked).toBe(false);
    });

    it('chooses which layer new work lands on without editing the drawing', async () => {
        const user = userEvent.setup();

        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Furniture' }));

        expect(useEditorStore.getState().activeLayerId).toBe('layer_furniture');

        // The active layer is not saved, so there is nothing here to undo.
        expect(history.getState().canUndo).toBe(false);
    });

    it('marks the active layer as pressed, for anyone not reading the colour', async () => {
        const user = userEvent.setup();

        render(<SceneTree />);

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

        render(<SceneTree />);

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

        render(<SceneTree />);
        await user.click(screen.getByRole('button', { name: 'Move Openings down' }));

        history.undo();

        expect(layers().map((layer) => layer.name)[0]).toBe('Architecture');
    });

    it('will not move the bottom layer down or the top one up', () => {
        render(<SceneTree />);

        expect(screen.getByRole('button', { name: 'Move Architecture down' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move Annotations up' })).toBeDisabled();
    });
});

/**
 * The half of the panel that is new: what is standing on each layer.
 *
 * The list is shut until somebody opens it, which is the whole of the performance story — a
 * plan of several hundred elements renders several hundred rows only when asked, and the count
 * on the row says how many that would be first.
 */
describe('what is on a layer', () => {
    beforeEach(() =>
        useDocumentStore.setState({
            document: {
                ...emptyDocument('Ground floor'),
                id: 'doc',
                elements: [
                    { ...createWall(point(0, 0), point(3200, 0), LAYER), id: 'w1' },
                    { ...createText('Bedroom', point(0, 0), 'layer_annotations'), id: 't1' },
                ],
            },
            dropped: [],
            error: null,
        }),
    );

    it('says how many there are without listing them', () => {
        render(<SceneTree />);

        expect(screen.getByRole('button', { name: 'Expand Architecture' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Wall/ })).not.toBeInTheDocument();
    });

    it('lists them by what they call themselves, once opened', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Expand Architecture' }));

        expect(screen.getByRole('button', { name: /Wall · 3\.200 m/ })).toBeInTheDocument();
    });

    it('lets a text row say its own words, which is the whole point of the thing', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Expand Annotations' }));

        expect(screen.getByRole('button', { name: /Bedroom/ })).toBeInTheDocument();
    });

    it('selects what is clicked', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Expand Architecture' }));
        await userEvent.click(screen.getByRole('button', { name: /Wall · 3\.200 m/ }));

        expect(useEditorStore.getState().selection).toEqual(['w1']);
    });

    /*
     * A name somebody types goes to `metadata.label` through a command, so renaming undoes like
     * every other edit — and clearing it hands the row back to the name it works out.
     */
    it('renames through a command, and undoes', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Expand Architecture' }));
        await userEvent.dblClick(screen.getByRole('button', { name: /Wall · 3\.200 m/ }));

        const field = screen.getByRole('textbox', { name: /Rename Wall/ });

        await userEvent.type(field, 'Party wall{Enter}');

        expect(elementNamed('w1')?.metadata?.label).toBe('Party wall');

        history.undo();

        expect(elementNamed('w1')?.metadata?.label).toBeUndefined();
    });

    it('hands a row back its derived name when the typed one is cleared', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Expand Architecture' }));
        await userEvent.dblClick(screen.getByRole('button', { name: /Wall · 3\.200 m/ }));
        await userEvent.type(screen.getByRole('textbox', { name: /Rename Wall/ }), 'Party{Enter}');
        await userEvent.dblClick(screen.getByRole('button', { name: /Party/ }));
        await userEvent.clear(screen.getByRole('textbox', { name: /Rename Party/ }));
        await userEvent.keyboard('{Enter}');

        expect(elementNamed('w1')?.metadata?.label).toBeUndefined();
        expect(screen.getByRole('button', { name: /Wall · 3\.200 m/ })).toBeInTheDocument();
    });
});

/**
 * `docs/document-format.md` §3 has said since it was written that a layer can be created,
 * renamed and deleted, and that deleting offers to move its contents first. None of it existed
 * until now, which is the kind of thing a format document says once and nobody checks again.
 */
describe('editing the layers themselves', () => {
    beforeEach(() => open());

    it('adds one, through a command', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'New layer' }));

        expect(layers()).toHaveLength(6);

        history.undo();

        expect(layers()).toHaveLength(5);
    });

    it('renames one', async () => {
        render(<SceneTree />);

        await userEvent.dblClick(screen.getByRole('button', { name: 'Architecture' }));
        await userEvent.clear(screen.getByRole('textbox', { name: /Rename Architecture/ }));
        await userEvent.type(
            screen.getByRole('textbox', { name: /Rename Architecture/ }),
            'Shell{Enter}',
        );

        expect(layers()[0]?.name).toBe('Shell');
    });

    it('deletes an empty one outright', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Delete Furniture' }));

        expect(layers().map((layer) => layer.name)).not.toContain('Furniture');
    });

    /*
     * The promise the format document has been making. A layer with something on it is not
     * deleted on the spot: what is standing there is offered a new home first, and both halves
     * go into one command so an undo cannot land between them.
     */
    it('offers to move what is on a full one, and moves it in the same breath', async () => {
        render(<SceneTree />);

        await userEvent.click(screen.getByRole('button', { name: 'Delete Architecture' }));

        expect(screen.getByText(/Architecture holds 1 element/)).toBeInTheDocument();

        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Move contents to' }),
            'layer_furniture',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Move and delete' }));

        expect(layers().map((layer) => layer.id)).not.toContain(LAYER);
        expect(elementNamed('w1')?.layerId).toBe('layer_furniture');

        // One command, so one undo puts the layer back with its wall standing on it again.
        history.undo();

        expect(layers().map((layer) => layer.id)).toContain(LAYER);
        expect(elementNamed('w1')?.layerId).toBe(LAYER);
    });

    it('will not delete the last one standing', () => {
        useDocumentStore.setState({
            document: { ...emptyDocument('One'), id: 'doc', layers: layers().slice(0, 1) },
            dropped: [],
            error: null,
        });

        render(<SceneTree />);

        expect(screen.getByRole('button', { name: 'Delete Architecture' })).toBeDisabled();
    });
});

function elementNamed(id: string) {
    return useDocumentStore.getState().document.elements.find((element) => element.id === id);
}
