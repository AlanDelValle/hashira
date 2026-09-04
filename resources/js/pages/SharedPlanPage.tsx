import { Maximize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { formatScale } from '@/editor/model/units';
import { CanvasHost } from '@/editor/react/CanvasHost';
import { useFrameOnce, zoomToDrawing } from '@/editor/react/framing';
import { useDocumentStore } from '@/editor/store/documentStore';
import { registerBlocks } from '@/projects/useBlocks';
import { acceptShareLink } from '@/editor/persistence/sharing';
import { useEditorStore } from '@/editor/store/editorStore';
import { api, type Envelope } from '@/lib/api';
import type { ShareRole, SharedDocumentPayload } from '@/types/api';
import { Button } from '@/ui/Button';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Wordmark } from '@/ui/Logo';
import { SkipLink } from '@/ui/SkipLink';

/**
 * What a link recipient sees: the drawing, and a way to look around it.
 *
 * It is the same renderer the editor uses, with an input controller that only pans and zooms —
 * so a viewer gets a real drawing to inspect rather than a flat picture, while there is nothing
 * here that could change it. The endpoint behind this page returns the drawing and nothing
 * else: no project, no owner, no identifiers.
 *
 * That is true of every link, including one that offers editing. A link is read-only until it
 * is deliberately taken up, and taking it up means signing in — which is what turns a token
 * into a person the policy can answer about, instead of a URL that carries permission around.
 */
export function SharedPlanPage() {
    const { token } = useParams<{ token: string }>();
    const [name, setName] = useState<string | null>(null);
    const [role, setRole] = useState<ShareRole>('viewer');
    const [loading, setLoading] = useState(true);

    const load = useDocumentStore((state) => state.load);
    const parseError = useDocumentStore((state) => state.error);
    const drawingId = useDocumentStore((state) => state.document.id);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const scale = useDocumentStore((state) => state.document.settings.scale);

    useEffect(() => {
        let cancelled = false;

        // Nothing here can select or edit, and a selection left over from an editor session in
        // the same tab would paint accent-coloured geometry into a read-only view.
        useEditorStore.getState().clearSelection();

        void api
            .get<Envelope<SharedDocumentPayload>>(`/api/share/${token ?? ''}`)
            .then((response) => {
                if (cancelled) return;

                // A visitor has no library of their own, so the drawing arrives with the
                // blocks it uses and they are registered before it is parsed.
                registerBlocks(response.data.blocks);
                load(response.data.drawing);
                setName(response.data.name);
                setRole(response.data.role);
            })
            .catch(() => {
                /* Unknown, revoked and expired links all land in the same empty state. */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [token, load]);

    // Not until the drawing has arrived: framing an empty store would fix the viewport on
    // nothing and count that as done.
    useFrameOnce(drawingId, name !== null);

    if (loading) {
        return <FullPageSpinner label="Opening shared drawing" />;
    }

    if (name === null || parseError !== null) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <h1 className="text-ink text-sm font-medium">
                        {parseError ?? 'This link is no longer active'}
                    </h1>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        It may have been revoked by its owner, or it may have expired.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-canvas grid h-screen grid-rows-[3rem_1fr]">
            <SkipLink to="sheet">Skip to the drawing</SkipLink>

            <header className="border-line bg-surface flex items-center gap-3 border-b px-4">
                <Link to="/" className="rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>

                <span className="bg-line h-4 w-px" aria-hidden />

                <h1 className="text-ink text-[13px] font-medium">{name}</h1>

                <span className="text-ink-subtle ml-auto font-mono text-[11px]">
                    {formatScale(scale)} · read only
                </span>

                <TakeUpLink token={token ?? ''} role={role} />

                <button
                    type="button"
                    title="Zoom to fit  ·  Shift 1"
                    aria-label="Zoom to fit"
                    onClick={zoomToDrawing}
                    className="text-ink-muted hover:bg-sunken hover:text-ink flex size-7 items-center justify-center rounded-md transition-colors"
                >
                    <Maximize2 className="size-3.5" aria-hidden />
                </button>
            </header>

            <main id="sheet" className="relative h-full min-h-0">
                <CanvasHost readOnly />

                {elementCount === 0 && (
                    <p className="text-ink-subtle pointer-events-none absolute inset-0 flex items-center justify-center text-sm">
                        This drawing is empty.
                    </p>
                )}
            </main>
        </div>
    );
}

/**
 * The offer a link makes, when it makes one.
 *
 * A viewer link makes none — it is already doing everything it can. The other two are shown
 * as a deliberate step rather than taken automatically: joining somebody's project is not a
 * thing to have happen to you because you followed a URL while signed in.
 */
function TakeUpLink({ token, role }: { token: string; role: ShareRole }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    if (role === 'viewer') {
        return null;
    }

    const verb = role === 'editor' ? 'edit' : 'comment on';

    if (user === null) {
        return (
            <Link
                to="/login"
                state={{ from: `/share/${token}` }}
                className="text-ink-muted hover:text-ink rounded-sm text-[13px] underline"
            >
                Sign in to {verb} this drawing
            </Link>
        );
    }

    async function join() {
        setBusy(true);
        setFailed(false);

        try {
            const project = await acceptShareLink(token);

            await navigate(`/projects/${project.id}`);
        } catch {
            setFailed(true);
            setBusy(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            {failed && (
                <span role="alert" className="text-danger text-[13px]">
                    Could not open it.
                </span>
            )}

            <Button size="sm" variant="primary" busy={busy} onClick={() => void join()}>
                {role === 'editor' ? 'Open in the editor' : 'Join to comment'}
            </Button>
        </div>
    );
}
