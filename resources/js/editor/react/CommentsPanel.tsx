import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
    deleteThread as deleteThreadRequest,
    replyToThread,
    setThreadResolved,
} from '@/editor/persistence/comments';
import { commentPins, useCommentsStore } from '@/editor/store/commentsStore';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/time';
import type { CommentThread } from '@/types/api';
import { Button } from '@/ui/Button';

import { CommentBody } from './CommentBody';
import { MentionField } from './MentionField';

/**
 * The conversations, in words.
 *
 * This is the other half of the pins, and it is not a convenience: a mark on a canvas that
 * means something by its shape and its colour means nothing to somebody who cannot see it, so
 * everything the drawing shows is also written here — which thread is open, which is settled,
 * who said what. That is the rule 9.5 set for redlines, and a pin is the next thing it applies
 * to. It is also the part that takes the keyboard, because the canvas is a picture.
 *
 * Choosing a thread brings its pin to the middle of the view, so the list and the drawing are
 * two ways into the same thing rather than two lists. How that happens is the host's business
 * — the editor moves its own viewport store, the review surface moves itself — so it arrives
 * as `focusOn` rather than being reached for from here.
 */
export function CommentsPanel({
    projectId,
    canComment,
    userId,
    isOwner,
    focusOn,
}: {
    projectId: string;
    /** False for somebody who may look but not take part; they still read the thread. */
    canComment: boolean;
    userId: number | null;
    isOwner: boolean;
    /** Bring this thread's pin into view, however this host does that. */
    focusOn: (thread: CommentThread) => void;
}) {
    const threads = useCommentsStore((state) => state.threads);
    const selectedId = useCommentsStore((state) => state.selectedId);
    const loading = useCommentsStore((state) => state.loading);
    const error = useCommentsStore((state) => state.error);
    const select = useCommentsStore((state) => state.select);

    const numbers = new Map(commentPins(threads).map((pin) => [pin.id, pin.number]));
    const open = threads.filter((thread) => !thread.resolved).length;

    function choose(thread: CommentThread) {
        select(thread.id === selectedId ? null : thread.id);
        focusOn(thread);
    }

    return (
        <aside
            aria-label="Comments"
            className="border-line bg-surface flex w-64 shrink-0 flex-col overflow-hidden border-r"
        >
            <div className="border-line flex items-center justify-between border-b px-3 py-2">
                <h2 className="text-ink-subtle text-[11px] font-medium tracking-wide uppercase">
                    Comments
                </h2>
                <span className="text-ink-subtle text-[11px]">
                    {open} open{threads.length > open && ` · ${threads.length - open} resolved`}
                </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading && <p className="text-ink-subtle px-3 py-3 text-[13px]">Loading…</p>}

                {error !== null && (
                    <p role="alert" className="text-danger px-3 py-3 text-[13px]">
                        {error}
                    </p>
                )}

                {!loading && error === null && threads.length === 0 && (
                    <p className="text-ink-muted px-3 py-3 text-[13px]">
                        Nothing yet. Pick the comment tool and click the drawing to say something
                        about a place on it.
                    </p>
                )}

                <ul>
                    {threads.map((thread) => (
                        <Thread
                            key={thread.id}
                            thread={thread}
                            number={numbers.get(thread.id) ?? 0}
                            expanded={thread.id === selectedId}
                            projectId={projectId}
                            canComment={canComment}
                            userId={userId}
                            isOwner={isOwner}
                            onChoose={() => choose(thread)}
                        />
                    ))}
                </ul>
            </div>
        </aside>
    );
}

function Thread({
    thread,
    number,
    expanded,
    projectId,
    canComment,
    userId,
    isOwner,
    onChoose,
}: {
    thread: CommentThread;
    number: number;
    expanded: boolean;
    projectId: string;
    canComment: boolean;
    userId: number | null;
    isOwner: boolean;
    onChoose: () => void;
}) {
    const put = useCommentsStore((state) => state.put);
    const remove = useCommentsStore((state) => state.remove);
    const people = useCommentsStore((state) => state.people);

    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    const opening = thread.comments[0];

    async function send(event: FormEvent) {
        event.preventDefault();

        if (reply.trim() === '') return;

        setBusy(true);
        setFailed(null);

        try {
            const comment = await replyToThread(projectId, thread.id, reply.trim());

            put({ ...thread, comments: [...thread.comments, comment] });
            setReply('');
        } catch {
            setFailed('Could not send that.');
        } finally {
            setBusy(false);
        }
    }

    async function toggleResolved() {
        setBusy(true);
        setFailed(null);

        try {
            put(await setThreadResolved(projectId, thread.id, !thread.resolved));
        } catch {
            setFailed('Could not change that.');
        } finally {
            setBusy(false);
        }
    }

    async function discard() {
        setBusy(true);
        setFailed(null);

        try {
            await deleteThreadRequest(projectId, thread.id);
            remove(thread.id);
        } catch {
            setFailed('Could not delete it.');
            setBusy(false);
        }
    }

    const mine = thread.authorId !== null && thread.authorId === userId;

    return (
        <li className="border-line border-b">
            <button
                type="button"
                onClick={onChoose}
                aria-expanded={expanded}
                className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                    expanded ? 'bg-accent-soft' : 'hover:bg-sunken',
                )}
            >
                {/*
                 * The same number as the pin, and the same open-or-settled distinction told
                 * without colour: a solid disc is open, a ring is resolved, exactly as on the
                 * drawing. The word is underneath, for anybody the shapes do not reach.
                 */}
                <span
                    aria-hidden
                    className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                        thread.resolved
                            ? 'border-line-strong text-ink-subtle border bg-transparent'
                            : 'bg-accent text-white',
                    )}
                >
                    {number}
                </span>

                <span className="min-w-0 flex-1">
                    <span className="text-ink block text-[13px] leading-snug">
                        {opening === undefined ? (
                            ''
                        ) : (
                            <CommentBody body={opening.body} mentions={opening.mentions} />
                        )}
                    </span>
                    <span className="text-ink-subtle mt-0.5 block text-[11px]">
                        {thread.authorName ?? 'A former collaborator'} ·{' '}
                        {formatRelativeTime(thread.createdAt)}
                        {thread.resolved && ' · resolved'}
                        {thread.comments.length > 1 && ` · ${thread.comments.length - 1} replies`}
                    </span>
                </span>
            </button>

            {expanded && (
                <div className="space-y-3 px-3 pb-3">
                    {thread.comments.slice(1).map((comment) => (
                        <div key={comment.id}>
                            <p className="text-ink text-[13px] leading-snug">
                                <CommentBody body={comment.body} mentions={comment.mentions} />
                            </p>
                            <p className="text-ink-subtle mt-0.5 text-[11px]">
                                {comment.authorName ?? 'A former collaborator'} ·{' '}
                                {formatRelativeTime(comment.createdAt)}
                            </p>
                        </div>
                    ))}

                    {canComment && (
                        <form onSubmit={(event) => void send(event)} className="space-y-2">
                            <MentionField
                                value={reply}
                                onChange={setReply}
                                people={people}
                                rows={2}
                                label="Reply"
                                placeholder="Reply. @ names somebody."
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="submit" size="sm" variant="primary" busy={busy}>
                                    Reply
                                </Button>

                                <Button size="sm" busy={busy} onClick={() => void toggleResolved()}>
                                    {thread.resolved ? (
                                        <RotateCcw className="size-3.5" aria-hidden />
                                    ) : (
                                        <Check className="size-3.5" aria-hidden />
                                    )}
                                    {thread.resolved ? 'Reopen' : 'Resolve'}
                                </Button>

                                {(mine || isOwner) && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        busy={busy}
                                        onClick={() => void discard()}
                                        aria-label="Delete this thread"
                                    >
                                        <Trash2 className="size-3.5" aria-hidden />
                                    </Button>
                                )}
                            </div>
                        </form>
                    )}

                    {failed !== null && (
                        <p role="alert" className="text-danger text-[13px]">
                            {failed}
                        </p>
                    )}
                </div>
            )}
        </li>
    );
}
