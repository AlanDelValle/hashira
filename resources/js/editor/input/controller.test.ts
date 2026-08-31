import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addElements } from '@/editor/commands/command';
import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createRect, createWall } from '@/editor/model/factories';
import {
    dimensionFrame,
    elementLength,
    elementWorldPoints,
    makeLookup,
} from '@/editor/model/elements';
import { history, runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';
import { useViewportStore } from '@/editor/store/viewportStore';

import { InputController } from './controller';

/**
 * Regression cover for a reported freeze: after placing a block, the select tool stopped
 * responding, no keyboard shortcut worked, and the cursor stayed on the block tool's.
 *
 * The cause was re-entrancy. Leaving a tool cancelled it *before* advancing the controller's
 * record of which tool is current, and the block tool's cancel wrote back to the same store
 * whose notification had just called it — so the re-entrant notification still saw the old
 * tool as current and cancelled again, for ever. The overflow escaped whichever handler was
 * running, and since every shortcut cancels the active tool first, all of them died with it.
 */
describe('leaving the block tool', () => {
    let canvas: HTMLCanvasElement;
    let controller: InputController;

    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({
            tool: 'select',
            pendingAssetId: null,
            selection: [],
        });

        canvas = window.document.createElement('canvas');
        window.document.body.append(canvas);

        controller = new InputController(canvas);
        controller.attach();
    });

    afterEach(() => {
        controller.detach();
        canvas.remove();
    });

    it('switches away without recursing through its own store notification', () => {
        useEditorStore.getState().setPendingAsset('sofa-3');
        expect(useEditorStore.getState().tool).toBe('asset');

        expect(() => useEditorStore.getState().setTool('select')).not.toThrow();

        expect(useEditorStore.getState().tool).toBe('select');
        expect(useEditorStore.getState().pendingAssetId).toBeNull();
    });

    it('still answers the keyboard afterwards', () => {
        useEditorStore.getState().setPendingAsset('sofa-3');
        useEditorStore.getState().setTool('select');

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

        expect(useEditorStore.getState().tool).toBe('rect');
    });

    it('still undoes afterwards', () => {
        runCommand(addElements([createRect(point(0, 0), point(100, 100), 'layer_architecture')]));
        expect(useDocumentStore.getState().document.elements).toHaveLength(1);

        useEditorStore.getState().setPendingAsset('sofa-3');
        useEditorStore.getState().setTool('select');

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

        expect(useDocumentStore.getState().document.elements).toHaveLength(0);
    });

    it('leaves the cursor on the tool that is actually current', () => {
        useEditorStore.getState().setPendingAsset('sofa-3');
        expect(canvas.style.cursor).toBe('copy');

        useEditorStore.getState().setTool('select');
        expect(canvas.style.cursor).toBe('default');
    });
});

/**
 * Reported from the editor: with snap on, dragging a wall diagonally landed on the grid and
 * dragging it straight did not. The alignment that holds a line straight was taking the free
 * coordinate with it, and the wall came out a fraction of a grid step long in the one
 * direction anybody would expect to be exact.
 *
 * Every tool that places points click by click goes through the same snap, so this checks
 * them through the controller — the way the pointer actually reaches them — rather than
 * through the engine they share.
 */
describe('placing points along an alignment', () => {
    let canvas: HTMLCanvasElement;
    let controller: InputController;

    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({ tool: 'select', pendingAssetId: null, selection: [] });
        useViewportStore.setState({
            viewport: { x: 0, y: 0, zoom: 1 },
            size: { width: 800, height: 600 },
        });

        canvas = window.document.createElement('canvas');
        window.document.body.append(canvas);

        // jsdom has no pointer capture, and the controller takes it on every press.
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
    function click(x: number, y: number): void {
        for (const type of ['pointerdown', 'pointerup']) {
            canvas.dispatchEvent(
                new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }),
            );
        }
    }

    function move(x: number, y: number): void {
        canvas.dispatchEvent(
            new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }),
        );
    }

    function elements() {
        return useDocumentStore.getState().document.elements;
    }

    it('draws a wall along a horizontal that is still a whole number of grid steps', () => {
        useEditorStore.getState().setTool('wall');

        click(0, 0);
        move(1234, 4);
        click(1234, 4);

        const wall = elements()[0];

        // The alignment holds it at y = 0; the grid still has the length.
        expect(wall?.type === 'wall' && elementLength(wall)).toBe(1200);
    });

    it('does the same on a vertical', () => {
        useEditorStore.getState().setTool('wall');

        click(0, 0);
        move(4, 1234);
        click(4, 1234);

        const wall = elements()[0];

        expect(wall?.type === 'wall' && elementLength(wall)).toBe(1200);
    });

    it('places a room’s vertices on the grid while they hold a line', () => {
        useEditorStore.getState().setTool('room');

        click(0, 0);
        click(1234, 6);
        click(1240, 812);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        const room = elements()[0];
        const corners =
            room?.type === 'room' ? elementWorldPoints(room, makeLookup(elements())) : [];

        expect(corners).toEqual([point(0, 0), point(1200, 0), point(1200, 800)]);
    });

    it('measures between points that are on the grid', () => {
        useEditorStore.getState().setTool('dimension');

        click(0, 0);
        click(1234, 6);
        click(1200, 400);

        const dimension = elements()[0];
        const frame = dimension?.type === 'dimension' ? dimensionFrame(dimension) : null;

        expect(frame?.length).toBe(1200);
    });

    /*
     * Reported alongside it: switching from select to wall gave nothing to work with until
     * after the first click. The point did snap — there was simply no way to see it, and
     * nothing to line the first point up with.
     */
    it('says where the first click will land, before anything has been placed', () => {
        useEditorStore.getState().setTool('wall');

        move(1234, 5678);

        // The readout follows this: where a click lands, not where the pointer is.
        expect(interaction.pointerWorld).toEqual(point(1200, 5700));

        // And the renderer has something to mark it with.
        expect(interaction.snap?.kind).toBe('grid');
    });

    it('lines the first point up with something already drawn', () => {
        runCommand(
            addElements([createWall(point(3000, 0), point(3000, 2000), 'layer_architecture')]),
        );

        useEditorStore.getState().setTool('wall');
        move(2996, 5678);

        expect(interaction.snap?.kind).toBe('vertical');
        expect(interaction.pointerWorld?.x).toBe(3000);
        expect(interaction.pointerWorld?.y).toBe(5700);
    });

    /*
     * The drag tools never offered an anchor, so an alignment could not steal anything from
     * them. They are here because the fix must not have taken the grid away from them either.
     */
    it('leaves the drag tools landing on the grid', () => {
        useEditorStore.getState().setTool('rect');

        canvas.dispatchEvent(
            new PointerEvent('pointerdown', { clientX: 40, clientY: 60, button: 0, bubbles: true }),
        );
        move(1234, 812);
        canvas.dispatchEvent(
            new PointerEvent('pointerup', {
                clientX: 1234,
                clientY: 812,
                button: 0,
                bubbles: true,
            }),
        );

        const rect = elements()[0];

        // Both corners land on the grid: 40,60 → 0,100 and 1234,812 → 1200,800.
        expect(rect?.type === 'rect' && rect.geometry).toEqual({ width: 1200, height: 700 });
    });
});
