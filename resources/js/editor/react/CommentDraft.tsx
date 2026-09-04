import { pinHead } from '@/editor/render/comments';
import { useCommentsStore } from '@/editor/store/commentsStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { screenToWorldDistance, toScreen } from '@/editor/viewport/viewport';

import { CommentComposer } from './CommentComposer';

/**
 * The composer, positioned over the editor's own canvas.
 *
 * All this adds to `CommentComposer` is where the box goes: the pin's head, worked out by the
 * same function that paints it, through the editor's viewport. The review surface does the
 * same sum with its own viewport, which is why the box itself knows about neither.
 */
export function CommentDraft({ projectId }: { projectId: string }) {
    const draft = useEditorStore((state) => state.commentDraft);
    const cancel = useEditorStore((state) => state.cancelComment);
    const viewport = useViewportStore((state) => state.viewport);
    const select = useCommentsStore((state) => state.select);

    if (draft === null) {
        return null;
    }

    const screen = toScreen(viewport, pinHead(draft.at, screenToWorldDistance(viewport, 1)));

    return (
        <CommentComposer
            // Keyed on the draft, so a second pin opens an empty box rather than the last
            // one's words.
            key={draft.id}
            projectId={projectId}
            at={draft.at}
            screen={screen}
            elementId={draft.elementId}
            onDone={(threadId) => {
                select(threadId);
                cancel();
            }}
            onCancel={cancel}
        />
    );
}
