import { Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import type { Point } from '@/editor/geometry/vec';
import { parseDocument } from '@/editor/model/document';
import { fetchPeople, fetchThreads } from '@/editor/persistence/comments';
import { CommentComposer } from '@/editor/react/CommentComposer';
import { CommentsPanel } from '@/editor/react/CommentsPanel';
import { ReviewCanvas, type ReviewCanvasHandle } from '@/editor/react/ReviewCanvas';
import { pinHead } from '@/editor/render/comments';
import type { ReviewContent } from '@/editor/render/review';
import { commentPins, useCommentsStore } from '@/editor/store/commentsStore';
import { useDocument } from '@/projects/useDocument';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Wordmark } from '@/ui/Logo';
import { SkipLink } from '@/ui/SkipLink';

/**
 * Where somebody who may comment but not edit works.
 *
 * It is the surface 9.5 built to look at a version on, given the one thing it lacked: a click
 * that means something. That was the choice — rather than handing a commenter the editor with
 * most of its buttons taken away, which would have meant teaching the toolbar, the shortcut
 * table, the panels, undo, the underlay dialog and the DXF import who was looking, one at a
 * time.
 *
 * So this has no tools, no layers, no sheets and no title block. A commenter does not use
 * them. What it has is the drawing, the pins on it and the conversation beside it, and the
 * drawing cannot be changed from here by any route at all — there is no command in this page.
 */
export function ReviewPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { document: payload, loading, error } = useDocument(projectId);
    const { user } = useAuth();

    const canvas = useRef<ReviewCanvasHandle>(null);

    const threads = useCommentsStore((state) => state.threads);
    const selectedId = useCommentsStore((state) => state.selectedId);
    const select = useCommentsStore((state) => state.select);

    /** Where a new remark is being written, before it is a thread. */
    const [draft, setDraft] = useState<{ at: Point; screen: Point } | null>(null);

    useEffect(() => {
        if (projectId === undefined) {
            return;
        }

        const comments = useCommentsStore.getState();

        comments.clear();
        comments.begin();

        void fetchThreads(projectId)
            .then((loaded) => useCommentsStore.getState().load(loaded))
            .catch(() => useCommentsStore.getState().fail('Could not load the comments.'));

        void fetchPeople(projectId)
            .then((people) => useCommentsStore.getState().loadPeople(people))
            .catch(() => {
                /* Without the roster, `@` simply offers nobody. */
            });

        return () => useCommentsStore.getState().clear();
    }, [projectId]);

    const parsed = useMemo(
        () => (payload === null ? null : parseDocument(payload.drawing)),
        [payload],
    );

    const content = useMemo(
        (): ReviewContent | null =>
            parsed?.ok === true ? { drawing: parsed.document, against: null, diff: null } : null,
        [parsed],
    );

    const pins = useMemo(() => commentPins(threads), [threads]);

    /*
     * Where the composer sits, kept beside the place it is about.
     *
     * The surface owns its viewport and repaints itself outside React, so the position is
     * pushed in when the view moves rather than read back during a render — the ref holding
     * the surface is not something a render may ask about.
     */
    function followTheView() {
        setDraft((current) => {
            const surface = canvas.current;

            if (current === null || surface === null) {
                return current;
            }

            return { ...current, screen: surface.toScreen(pinHead(current.at, surface.pixel())) };
        });
    }

    if (loading) {
        return <FullPageSpinner label="Opening drawing" />;
    }

    // Somebody who can edit has a better place to be, and the dashboard sends them there —
    // this catches the case of the address being typed or kept in a bookmark.
    if (payload?.role === 'owner' || payload?.role === 'editor') {
        return <Navigate to={`/projects/${projectId ?? ''}`} replace />;
    }

    if (error !== null || payload === null || parsed?.ok !== true) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p role="alert" className="text-ink text-sm">
                        {error ??
                            (parsed?.ok === false ? parsed.reason : null) ??
                            'Could not open this drawing.'}
                    </p>
                    <Link
                        to="/projects"
                        className="text-ink-muted mt-5 inline-block rounded-sm text-sm underline"
                    >
                        Back to projects
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-canvas grid h-screen grid-rows-[3rem_1fr]">
            <SkipLink to="sheet">Skip to the drawing</SkipLink>

            <header className="border-line bg-surface flex items-center gap-3 border-b px-4">
                <Link to="/projects" className="rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>

                <span className="bg-line h-4 w-px" aria-hidden />

                <h1 className="text-ink text-[13px] font-medium">{payload.name}</h1>

                <span className="text-ink-subtle ml-auto font-mono text-[11px]">comments only</span>

                <button
                    type="button"
                    title="Zoom to fit"
                    aria-label="Zoom to fit"
                    onClick={() => canvas.current?.frameAll()}
                    className="text-ink-muted hover:bg-sunken hover:text-ink flex size-7 items-center justify-center rounded-md transition-colors"
                >
                    <Maximize2 className="size-3.5" aria-hidden />
                </button>
            </header>

            <div className="flex min-h-0 overflow-hidden">
                <CommentsPanel
                    projectId={projectId ?? ''}
                    canComment={payload.role === 'commenter'}
                    userId={user?.id ?? null}
                    isOwner={false}
                    focusOn={(thread) => canvas.current?.centre({ x: thread.x, y: thread.y })}
                />

                <main id="sheet" className="relative min-w-0 flex-1 p-2">
                    <ReviewCanvas
                        ref={canvas}
                        content={content}
                        label={`${payload.name}, with its comments`}
                        pins={pins}
                        selectedPinId={selectedId}
                        onViewChange={followTheView}
                        onPick={(pick) => {
                            if (pick.kind === 'pin') {
                                setDraft(null);
                                select(pick.id);

                                return;
                            }

                            select(null);

                            // Only somebody who may comment gets a box; for anybody else a
                            // click on empty sheet is just a click.
                            if (payload.role === 'commenter') {
                                setDraft({
                                    at: pick.world,
                                    screen:
                                        canvas.current?.toScreen(
                                            pinHead(pick.world, canvas.current.pixel()),
                                        ) ?? pick.screen,
                                });
                            }
                        }}
                    />

                    {draft !== null && (
                        <CommentComposer
                            // Keyed on the place, so a second pin opens an empty box — and
                            // deliberately not on the view, which would throw away what was
                            // being typed the moment somebody panned.
                            key={`${draft.at.x},${draft.at.y}`}
                            projectId={projectId ?? ''}
                            at={draft.at}
                            screen={draft.screen}
                            elementId={null}
                            onDone={(threadId) => {
                                select(threadId);
                                setDraft(null);
                            }}
                            onCancel={() => setDraft(null)}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
