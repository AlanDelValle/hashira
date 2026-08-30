import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyDocument } from '@/editor/model/document';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { InputController } from './controller';
import { LIBRARY_KEY, SHORTCUT_GROUPS, TOOL_SHORTCUTS, toolForKey } from './shortcuts';

describe('the shortcut table', () => {
    it('gives every tool a key of its own', () => {
        const keys = TOOL_SHORTCUTS.map((tool) => tool.key.toLowerCase());

        expect(new Set([...keys, LIBRARY_KEY.toLowerCase()]).size).toBe(keys.length + 1);
    });

    it('resolves a key to a tool whatever case it arrives in', () => {
        expect(toolForKey('w')).toBe('wall');
        expect(toolForKey('W')).toBe('wall');
        expect(toolForKey('§')).toBeUndefined();
    });

    it('lists every tool in the reference', () => {
        const listed = SHORTCUT_GROUPS.flatMap((group) =>
            group.shortcuts.map((shortcut) => shortcut.label),
        );

        for (const tool of TOOL_SHORTCUTS) {
            expect(listed).toContain(tool.label);
        }
    });
});

/**
 * The table is only worth having if the controller really dispatches from it, so these press
 * the keys rather than inspecting the table twice.
 */
describe('pressing the keys the reference promises', () => {
    let canvas: HTMLCanvasElement;
    let controller: InputController;

    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        useEditorStore.setState({
            tool: 'select',
            pendingAssetId: null,
            selection: [],
            libraryOpen: false,
            shortcutsOpen: false,
            gridVisible: true,
            snapToGrid: true,
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

    function press(key: string, init: KeyboardEventInit = {}): void {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
    }

    it('selects every tool by its advertised key', () => {
        for (const tool of TOOL_SHORTCUTS) {
            press(tool.key.toLowerCase());

            expect(useEditorStore.getState().tool).toBe(tool.id);
        }
    });

    it('opens and closes the library, putting down the armed block on the way out', () => {
        press(LIBRARY_KEY.toLowerCase());
        expect(useEditorStore.getState().libraryOpen).toBe(true);

        useEditorStore.getState().setPendingAsset('sofa-3');
        expect(useEditorStore.getState().tool).toBe('asset');

        press(LIBRARY_KEY.toLowerCase());

        expect(useEditorStore.getState().libraryOpen).toBe(false);
        expect(useEditorStore.getState().pendingAssetId).toBeNull();
        expect(useEditorStore.getState().tool).toBe('select');
    });

    it('toggles the grid and the snap', () => {
        press('g');
        expect(useEditorStore.getState().gridVisible).toBe(false);

        press('s');
        expect(useEditorStore.getState().snapToGrid).toBe(false);
    });

    it('opens the reference', () => {
        press('?');

        expect(useEditorStore.getState().shortcutsOpen).toBe(true);
    });
});

describe('keys that are not the editor’s to take', () => {
    let canvas: HTMLCanvasElement;
    let controller: InputController;
    let dialog: HTMLDivElement;

    beforeEach(() => {
        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        useEditorStore.setState({ tool: 'select', selection: [], libraryOpen: false });

        canvas = window.document.createElement('canvas');
        dialog = window.document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<button type="button">Restore</button>';
        window.document.body.append(canvas, dialog);

        controller = new InputController(canvas);
        controller.attach();
    });

    afterEach(() => {
        controller.detach();
        canvas.remove();
        dialog.remove();
    });

    it('leaves a tool alone while a dialog has the keyboard', () => {
        const button = dialog.querySelector('button');

        button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));

        expect(useEditorStore.getState().tool).toBe('select');
    });

    it('leaves a tool alone while a field has the keyboard', () => {
        const field = window.document.createElement('input');
        window.document.body.append(field);

        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));

        expect(useEditorStore.getState().tool).toBe('select');

        field.remove();
    });
});
