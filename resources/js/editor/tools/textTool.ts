import { addElements } from '@/editor/commands/command';
import type { Point } from '@/editor/geometry/vec';
import { createText } from '@/editor/model/factories';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import type { HashiraDocument } from '@/editor/model/types';

import type { Tool } from './types';

/**
 * Writing on the drawing.
 *
 * The tool itself does almost nothing: a click decides *where* the label goes, and the words
 * are typed into a real input that the chrome floats over that point — see
 * `react/TextDraft.tsx`. A canvas has no caret, no selection and no input method, and faking
 * those is how a text tool ends up unable to spell anyone's name.
 *
 * So the click opens a draft, and committing the draft is what produces the one command.
 */
export function createTextTool(): Tool {
    return {
        id: 'text',
        cursor: 'text',

        onPointerDown(event) {
            useEditorStore.getState().beginText(event.world);
        },

        cancel() {
            /*
             * Escape, or leaving the tool, abandons what was being typed. This writes to the
             * store from inside a store notification, which is safe because the controller
             * advances its record of the current tool before cancelling — see
             * InputController.attach.
             */
            useEditorStore.getState().cancelText();
        },
    };
}

/** Labels belong on the annotations layer when it exists, not on whatever is active. */
export function annotationLayer(drawing: HashiraDocument, activeLayerId: string): string {
    return drawing.layers.some((layer) => layer.id === 'layer_annotations')
        ? 'layer_annotations'
        : activeLayerId;
}

/**
 * Commits a typed label, and answers whether anything was written. Blank is not a label: an
 * empty string would leave something selectable and invisible on the sheet.
 */
export function commitText(content: string, at: Point): boolean {
    const trimmed = content.trim();

    if (trimmed === '') {
        return false;
    }

    const { activeLayerId, textSize, select } = useEditorStore.getState();
    const drawing = useDocumentStore.getState().document;

    const element = createText(trimmed, at, annotationLayer(drawing, activeLayerId), textSize);

    runCommand(addElements([element], 'Text'));
    select([element.id]);

    return true;
}
