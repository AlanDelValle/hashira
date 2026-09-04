import { pickAt } from '@/editor/model/picking';
import { pinAt } from '@/editor/render/comments';
import { commentPins, useCommentsStore } from '@/editor/store/commentsStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { screenToWorldDistance } from '@/editor/viewport/viewport';

import type { Tool } from './types';

/**
 * Saying something about a place.
 *
 * The only tool that writes nothing to the document. Rule 2 is about document mutations, and a
 * remark is not one — it is not a thing anybody drew, and it lives in its own table for
 * exactly that reason. So this produces no command: the click decides *where*, and the words
 * are typed into a real field the chrome floats over that point, which is the same bargain the
 * text tool makes and for the same reason.
 *
 * Clicking an existing pin opens its thread instead of dropping a second one on top of it.
 *
 * The point is deliberately not snapped. A snap is for construction — a remark is made where
 * somebody was looking, and rounding it to the nearest endpoint would move it off the thing
 * they meant.
 */
export function createCommentTool(): Tool {
    return {
        id: 'comment',
        cursor: 'crosshair',

        onPointerDown(event, context) {
            const { threads, select } = useCommentsStore.getState();
            const px = screenToWorldDistance(context.viewport, 1);
            const hit = pinAt(commentPins(threads), event.rawWorld, px);

            if (hit !== null) {
                useEditorStore.getState().cancelComment();
                select(hit.id);

                return;
            }

            /*
             * What the pin was dropped on, if it landed on anything. It is recorded and never
             * used to move the pin: a remark is made at a place, and following the geometry
             * would re-point somebody's words when a wall moved. What it is for is telling a
             * thread that the thing it was about has been deleted.
             */
            const element = pickAt(context.drawing, event.rawWorld, context.tolerance);

            select(null);
            useEditorStore.getState().beginComment(event.rawWorld, element?.id ?? null);
        },

        cancel() {
            useEditorStore.getState().cancelComment();
        },
    };
}
