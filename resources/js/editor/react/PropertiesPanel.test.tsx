import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument, WallElement } from '@/editor/model/types';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { PropertiesPanel } from './PropertiesPanel';

/**
 * The panel that edits the drawing by typing at it.
 *
 * Two promises are worth holding it to, and neither is visible from the outside. The first is
 * that **every field writes through a command**, so a value typed here undoes exactly like a
 * value dragged — and consecutive edits to the same field merge, so arrowing a spinner does not
 * fill the history with sixty entries. The second is that **the panel is a display boundary**:
 * the document is millimetres, the field is metres, and nothing half-typed is allowed across.
 */

const LAYER = 'layer_architecture';

/** A 4 m wall, 150 mm thick, centred at (2000, 0). */
function wall(): WallElement {
    return { ...createWall(point(0, 0), point(4000, 0), LAYER, 150), id: 'w1' };
}

function open(elements: Element[], selection: string[]): HashiraDocument {
    const document = { ...emptyDocument('Ground floor'), id: 'doc', elements };

    useDocumentStore.setState({ document, dropped: [], error: null });
    useEditorStore.setState({ selection, activeLayerId: LAYER });
    history.clear();

    return document;
}

function currentWall(): WallElement {
    const element = useDocumentStore.getState().document.elements[0];

    if (element?.type !== 'wall') {
        throw new Error('expected the wall to still be there');
    }

    return element;
}

/** Type into a field and commit it the way Enter does. */
async function typeInto(label: string, text: string) {
    const user = userEvent.setup();
    const field = screen.getByLabelText(label);

    await user.clear(field);
    await user.type(field, `${text}{Enter}`);
}

describe('the properties panel', () => {
    beforeEach(() => {
        open([wall()], ['w1']);
    });

    it('says so when nothing is selected', () => {
        open([wall()], []);
        render(<PropertiesPanel />);

        expect(screen.getByText('Nothing selected.')).toBeInTheDocument();
    });

    it('counts a multiple selection rather than pretending to edit it', () => {
        const second = { ...wall(), id: 'w2' };

        open([wall(), second], ['w1', 'w2']);
        render(<PropertiesPanel />);

        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText(/Select a single element/)).toBeInTheDocument();
    });

    it('names what is selected', () => {
        render(<PropertiesPanel />);

        expect(screen.getByText('Wall')).toBeInTheDocument();
    });

    it('shows millimetres in the display unit', () => {
        render(<PropertiesPanel />);

        // 150 mm of wall, in a drawing set to metres.
        expect(screen.getByLabelText('Thickness')).toHaveValue('0.150');
        expect(screen.getByLabelText('Length')).toHaveValue('4.000');
    });

    it('parses what is typed back into millimetres', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', '0.3');

        expect(currentWall().geometry.thickness).toBe(300);
    });

    it('takes a unit typed into the field', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', '220mm');

        expect(currentWall().geometry.thickness).toBe(220);
    });

    it('writes through a command, so typing undoes like dragging', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', '0.3');

        expect(history.getState().canUndo).toBe(true);

        history.undo();

        expect(currentWall().geometry.thickness).toBe(150);
    });

    it('merges consecutive edits to one field into a single undo step', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', '0.2');
        await typeInto('Thickness', '0.3');
        await typeInto('Thickness', '0.4');

        expect(currentWall().geometry.thickness).toBe(400);

        // One press, and the wall is back where the edit began — not two thirds of the way.
        history.undo();

        expect(currentWall().geometry.thickness).toBe(150);
        expect(history.getState().canUndo).toBe(false);
    });

    it('keeps edits to different fields as separate undo steps', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', '0.3');
        await typeInto('Length', '6');

        history.undo();

        expect(currentWall().geometry.thickness).toBe(300);
    });

    it('keeps a draft to itself until it is committed', async () => {
        const user = userEvent.setup();

        render(<PropertiesPanel />);

        const field = screen.getByLabelText('Thickness');

        await user.clear(field);
        await user.type(field, '0.3');

        // Typed but not committed. A half-finished "0." on its way to "0.3" must not reach the
        // drawing, and neither must the finished number until the field is done with.
        expect(currentWall().geometry.thickness).toBe(150);

        await user.tab();

        expect(currentWall().geometry.thickness).toBe(300);
    });

    it('reverts a value it cannot read, rather than guessing at one', async () => {
        render(<PropertiesPanel />);

        await typeInto('Thickness', 'thick');

        expect(currentWall().geometry.thickness).toBe(150);
        expect(screen.getByLabelText('Thickness')).toHaveValue('0.150');
        expect(history.getState().canUndo).toBe(false);
    });

    it('abandons a draft on Escape', async () => {
        const user = userEvent.setup();

        render(<PropertiesPanel />);

        const field = screen.getByLabelText('Thickness');

        await user.clear(field);
        await user.type(field, '0.9{Escape}');

        expect(currentWall().geometry.thickness).toBe(150);
        expect(field).toHaveValue('0.150');
    });

    it('moves an element by its coordinates', async () => {
        render(<PropertiesPanel />);

        await typeInto('X', '10');

        expect(currentWall().transform.x).toBe(10_000);
    });

    it('sets a length by growing the segment rather than moving it', async () => {
        render(<PropertiesPanel />);

        await typeInto('Length', '6');

        const geometry = currentWall().geometry;
        const length = Math.hypot(geometry.b.x - geometry.a.x, geometry.b.y - geometry.a.y);

        expect(length).toBeCloseTo(6000);
    });

    it('moves an element to another layer', async () => {
        const user = userEvent.setup();

        render(<PropertiesPanel />);
        await user.selectOptions(screen.getByLabelText('Layer'), 'layer_annotations');

        expect(currentWall().layerId).toBe('layer_annotations');
        expect(history.getState().canUndo).toBe(true);
    });
});
