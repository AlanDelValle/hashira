import { useEffect, useRef, useState } from 'react';

import { startThread } from '@/editor/persistence/comments';
import { pinHead } from '@/editor/render/comments';
import { useCommentsStore } from '@/editor/store/commentsStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { screenToWorldDistance, toScreen } from '@/editor/viewport/viewport';
import { Button } from '@/ui/Button';

/**
 * Writing the remark, at the place it is about.
 *
 * A real field floated over the sheet, for the reason the text tool floats one: a canvas has
 * no caret, no selection and no input method, and a comment box that cannot take an input
 * method cannot take half the sentences it will be asked to take.
 *
 * It sits where the pin's head will sit, worked out by the same function that paints it, so
 * the box does not stand somewhere the pin is not. Escape throws it away; blank is not a
 * remark, and nothing is posted until there is something to post.
 */
export function CommentDraft({ projectId }: { projectId: string }) {
    const draft = useEditorStore((state) => state.commentDraft);

    if (draft === null) {
        return null;
    }

    // Keyed on the draft, so a second pin opens an empty box rather than the last one's words.
    return <Composer key={draft.id} projectId={projectId} />;
}

function Composer({ projectId }: { projectId: string }) {
    const draft = useEditorStore((state) => state.commentDraft);
    const cancel = useEditorStore((state) => state.cancelComment);
    const viewport = useViewportStore((state) => state.viewport);
    const put = useCommentsStore((state) => state.put);
    const select = useCommentsStore((state) => state.select);

    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const field = useRef<HTMLTextAreaElement>(null);

    /*
     * Focused a frame late, for the same reason the label field is: the click that opened this
     * is a click on the canvas, and the browser moves focus there as that mousedown's default
     * action — after this has mounted. Taking the keyboard now would only be to lose it.
     */
    useEffect(() => {
        const frame = requestAnimationFrame(() => field.current?.focus());

        return () => cancelAnimationFrame(frame);
    }, []);

    if (draft === null) {
        return null;
    }

    const px = screenToWorldDistance(viewport, 1);
    const screen = toScreen(viewport, pinHead(draft.at, px));

    async function post() {
        const trimmed = body.trim();

        if (trimmed === '' || draft === null) {
            cancel();

            return;
        }

        setBusy(true);
        setFailed(false);

        try {
            const thread = await startThread(projectId, {
                x: draft.at.x,
                y: draft.at.y,
                elementId: draft.elementId,
                body: trimmed,
            });

            put(thread);
            select(thread.id);
            cancel();
        } catch {
            setFailed(true);
            setBusy(false);
        }
    }

    return (
        <div
            className="border-line bg-surface shadow-panel absolute z-10 w-60 rounded-md border p-2"
            style={{ left: screen.x + 14, top: screen.y - 10 }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <textarea
                ref={field}
                value={body}
                rows={3}
                aria-label="Comment"
                placeholder="Say something about this place"
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                    // The editor's own listener stands aside for a field; this keeps the keys
                    // from travelling any further, so `K` types a letter instead of switching
                    // tools mid-sentence.
                    event.stopPropagation();

                    if (event.key === 'Escape') {
                        cancel();
                    }
                }}
                className="border-line-strong bg-sunken text-ink w-full resize-y rounded-md border px-2 py-1.5 text-[13px]"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
                {failed ? (
                    <span role="alert" className="text-danger text-[11px]">
                        Could not post it.
                    </span>
                ) : (
                    <span className="text-ink-subtle text-[11px]">Esc to discard</span>
                )}

                <Button size="sm" variant="primary" busy={busy} onClick={() => void post()}>
                    Comment
                </Button>
            </div>
        </div>
    );
}
