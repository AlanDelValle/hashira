import { useEffect, useRef, useState } from 'react';

import type { Point } from '@/editor/geometry/vec';
import { startThread } from '@/editor/persistence/comments';
import { useCommentsStore } from '@/editor/store/commentsStore';
import { Button } from '@/ui/Button';

import { MentionField } from './MentionField';

/**
 * The box a remark is written in, wherever it is being written.
 *
 * A real field floated over the sheet, for the reason the text tool floats one: a canvas has
 * no caret, no selection and no input method, and a comment box that cannot take an input
 * method cannot take half the sentences it will be asked to take.
 *
 * It knows nothing about which surface it is over. Both the editor and the review surface work
 * out where the pin's head will be and hand that in as `screen`, so there is one composer and
 * not two that drift apart.
 */
export function CommentComposer({
    projectId,
    at,
    screen,
    elementId,
    onDone,
    onCancel,
}: {
    projectId: string;
    /** Where the pin points, in world millimetres. */
    at: Point;
    /** Where to put the box, in canvas pixels — usually beside the pin's head. */
    screen: Point;
    elementId: string | null;
    onDone: (threadId: string) => void;
    onCancel: () => void;
}) {
    const put = useCommentsStore((state) => state.put);
    const people = useCommentsStore((state) => state.people);

    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    /*
     * Focused a frame late, on purpose. The click that opened this is a click on the canvas,
     * and the browser moves focus there as that mousedown's default action — after this has
     * mounted. Taking the keyboard now would only be to lose it a moment later.
     */
    useEffect(() => {
        const frame = requestAnimationFrame(() => box.current?.querySelector('textarea')?.focus());

        return () => cancelAnimationFrame(frame);
    }, []);

    async function post() {
        const trimmed = body.trim();

        if (trimmed === '') {
            onCancel();

            return;
        }

        setBusy(true);
        setFailed(false);

        try {
            const thread = await startThread(projectId, {
                x: at.x,
                y: at.y,
                elementId,
                body: trimmed,
            });

            put(thread);
            onDone(thread.id);
        } catch {
            setFailed(true);
            setBusy(false);
        }
    }

    return (
        <div
            ref={box}
            className="border-line bg-surface shadow-panel absolute z-10 w-64 rounded-md border p-2"
            style={{ left: screen.x + 14, top: screen.y - 10 }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <MentionField
                value={body}
                onChange={setBody}
                people={people}
                label="Comment"
                placeholder="Say something about this place. @ names somebody."
                onSubmit={() => void post()}
                onEscape={onCancel}
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
