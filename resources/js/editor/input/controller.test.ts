import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addElements } from '@/editor/commands/command';
import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createRect } from '@/editor/model/factories';
import { history, runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

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
