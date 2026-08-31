import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { dimensionFrame } from '@/editor/model/elements';
import { DEFAULT_DIMENSION_SIZE } from '@/editor/model/factories';
import type { DimensionElement } from '@/editor/model/types';
import { InputController } from '@/editor/input/controller';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';

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

/**
 * Reported from the editor: the tool would not finish. The third click committed the
 * measurement and left the run live, so the next click — meant for something else entirely —
 * carried the last measurement across the drawing instead of starting a new one.
 *
 * Driven through the controller rather than through the tool, because the bug was in what a
 * click means, and that is the only place a click exists.
 */
describe('finishing a measurement', () => {
    let canvas: HTMLCanvasElement;
    let controller: InputController;

    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({
            tool: 'dimension',
            selection: [],
            dimensionSize: DEFAULT_DIMENSION_SIZE,
            activeLayerId: 'layer_architecture',
        });

        useViewportStore.setState({
            viewport: { x: 0, y: 0, zoom: 1 },
            size: { width: 800, height: 600 },
        });

        canvas = window.document.createElement('canvas');
        window.document.body.append(canvas);

        canvas.setPointerCapture = () => undefined;
        canvas.releasePointerCapture = () => undefined;
        canvas.hasPointerCapture = () => false;

        controller = new InputController(canvas);
        controller.attach();
    });

    afterEach(() => {
        controller.detach();
        canvas.remove();
    });

    /** At zoom 1 with the viewport at the origin, a client pixel is a world millimetre. */
    function click(x: number, y: number, shift = false): void {
        for (const type of ['pointerdown', 'pointerup']) {
            canvas.dispatchEvent(
                new PointerEvent(type, {
                    clientX: x,
                    clientY: y,
                    button: 0,
                    shiftKey: shift,
                    bubbles: true,
                }),
            );
        }
    }

    it('is finished after the third click', () => {
        click(0, 0);
        click(2000, 0);
        click(2000, 500);

        expect(dimensions()).toHaveLength(1);
        expect(dimensionFrame(dimensions()[0]!)?.length).toBe(2000);

        // A fourth click somewhere else starts a new measurement rather than carrying the
        // first one over to it.
        click(5000, 3000);
        click(5000, 5000);
        click(5500, 4000);

        expect(dimensions()).toHaveLength(2);
        expect(dimensionFrame(dimensions()[0]!)?.length).toBe(2000);
        expect(dimensionFrame(dimensions()[1]!)?.length).toBe(2000);
    });

    it('carries the run on when the third click is held with Shift', () => {
        click(0, 0);
        click(2000, 0);
        click(2000, 500, true);

        // Still one mark, and the further click adds a step to it rather than starting again.
        click(5000, 0);

        expect(dimensions()).toHaveLength(1);

        const frame = dimensionFrame(dimensions()[0]!);

        expect(frame?.segments.map((segment) => segment.length)).toEqual([2000, 3000]);
        expect(frame?.length).toBe(5000);
    });

    it('stops carrying it on at Enter', () => {
        click(0, 0);
        click(2000, 0);
        click(2000, 500, true);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        click(5000, 3000);
        click(5000, 5000);
        click(5500, 4000);

        expect(dimensions()).toHaveLength(2);
        expect(dimensionFrame(dimensions()[0]!)?.segments).toHaveLength(1);
    });
});
