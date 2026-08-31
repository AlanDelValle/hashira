import { addElements } from '@/editor/commands/command';
import { distance, type Point } from '@/editor/geometry/vec';
import { createLeader, createText } from '@/editor/model/factories';
import { requestRepaint } from '@/editor/render/frame';
import { interaction } from '@/editor/store/interaction';
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

/**
 * A note, and the line that says what it is about.
 *
 * The first click is on the thing being annotated; further clicks bend the line on its way to
 * where the words will go; Enter, a double click, or a second click in the same place ends the
 * line and opens the field. The words themselves are typed into the same real input a label
 * uses, for the same reason — a canvas has no caret, no selection and no input method.
 */
export function createLeaderTool(): Tool {
    let points: Point[] = [];

    function clearDraft(): void {
        points = [];
        interaction.preview = null;
        interaction.draftPoints = [];
        requestRepaint();
    }

    function finish(): void {
        // A leader needs somewhere to point from and somewhere to write; one click is neither.
        if (points.length >= 2) {
            useEditorStore.getState().beginNote(points);
        }

        clearDraft();
    }

    return {
        id: 'leader',
        cursor: 'crosshair',

        anchors: () => points,

        onPointerMove(event) {
            if (points.length === 0) {
                return;
            }

            interaction.draftPoints = [...points, event.world];
            requestRepaint();
        },

        onPointerDown(event) {
            const last = points[points.length - 1];

            // Clicking where the line already ends is how you say it has gone far enough.
            if (last !== undefined && distance(last, event.world) === 0) {
                finish();

                return;
            }

            points = [...points, event.world];
            interaction.draftPoints = points;
            requestRepaint();
        },

        onDoubleClick() {
            finish();
        },

        onKeyDown(key) {
            if (key === 'Enter' && points.length >= 2) {
                finish();

                return true;
            }

            return false;
        },

        cancel() {
            clearDraft();
            useEditorStore.getState().cancelText();
        },
    };
}

/**
 * Commits a typed note. Blank is not a note, for the same reason blank is not a label — and
 * a leader with nothing written at the end of it is a line pointing at something for no
 * stated reason.
 */
export function commitLeader(content: string, points: readonly Point[]): boolean {
    const trimmed = content.trim();

    if (trimmed === '' || points.length < 2) {
        return false;
    }

    const { activeLayerId, textSize, select } = useEditorStore.getState();
    const drawing = useDocumentStore.getState().document;

    const element = createLeader(
        points,
        trimmed,
        annotationLayer(drawing, activeLayerId),
        textSize,
    );

    runCommand(addElements([element], 'Leader'));
    select([element.id]);

    return true;
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
