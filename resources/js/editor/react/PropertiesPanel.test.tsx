import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createLine, createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument, LineElement, WallElement } from '@/editor/model/types';
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

    /*
     * The panel's half of the merging promise, which is the half it decides: consecutive edits
     * to one field all carry the same coalesce key, so the history is able to fold them.
     *
     * Whether two commands carrying that key actually do fold is the history's rule, and it is
     * a rule about elapsed time — `history.test.ts` proves it against an injected clock, which
     * is the only way to prove it. Asserting it from out here meant asserting that three rounds
     * of simulated typing land inside the 600ms window: true on an idle machine, with about
     * 190ms of the window used per edit, and false the moment one of them ran three times slow.
     * Neither outcome said anything about this panel.
     */
    it('tags consecutive edits to one field with the same coalesce key, so they merge', async () => {
        render(<PropertiesPanel />);

        const executed = vi.spyOn(history, 'execute');

        await typeInto('Thickness', '0.2');
        await typeInto('Thickness', '0.3');
        await typeInto('Thickness', '0.4');

        expect(currentWall().geometry.thickness).toBe(400);
        expect(executed.mock.calls.map(([command]) => command.coalesceKey)).toEqual([
            'thickness:w1',
            'thickness:w1',
            'thickness:w1',
        ]);
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

    /*
     * The line type is offered on the four shapes somebody draws for their own sake, and on
     * nothing else. A wall means what it means because it is a wall.
     */
    it('does not offer a line type on a wall', () => {
        render(<PropertiesPanel />);

        expect(screen.queryByLabelText('Line')).not.toBeInTheDocument();
    });
});

describe('naming how a line reads, from the panel', () => {
    function line(): LineElement {
        return { ...createLine(point(0, 0), point(3000, 0), LAYER), id: 'l1' };
    }

    function currentLine(): LineElement {
        const element = useDocumentStore.getState().document.elements[0];

        if (element?.type !== 'line') {
            throw new Error('expected the line to still be there');
        }

        return element;
    }

    beforeEach(() => {
        open([line()], ['l1']);
    });

    it('shows contínua larga for a line nobody has named', () => {
        render(<PropertiesPanel />);

        expect(screen.getByLabelText('Line')).toHaveValue('continuous-wide');
    });

    it('names one, through a command, so it undoes', async () => {
        const user = userEvent.setup();

        render(<PropertiesPanel />);
        await user.selectOptions(screen.getByLabelText('Line'), 'dash-dot-narrow');

        expect(currentLine().style?.lineType).toBe('dash-dot-narrow');
        expect(history.getState().canUndo).toBe(true);
    });

    it('takes the field away again when the default is chosen back', async () => {
        const user = userEvent.setup();

        render(<PropertiesPanel />);
        await user.selectOptions(screen.getByLabelText('Line'), 'dashed-narrow');
        await user.selectOptions(screen.getByLabelText('Line'), 'continuous-wide');

        expect(currentLine().style?.lineType).toBeUndefined();
    });
});
