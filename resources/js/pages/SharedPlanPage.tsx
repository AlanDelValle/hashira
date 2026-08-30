import { Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { documentBounds } from '@/editor/model/elements';
import { formatScale } from '@/editor/model/units';
import { CanvasHost } from '@/editor/react/CanvasHost';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { centreOn, DEFAULT_ZOOM } from '@/editor/viewport/viewport';
import { api, type Envelope } from '@/lib/api';
import type { SharedDocumentPayload } from '@/types/api';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Wordmark } from '@/ui/Logo';

/**
 * What a link recipient sees: the drawing, and a way to look around it.
 *
 * It is the same renderer the editor uses, with an input controller that only pans and zooms —
 * so a viewer gets a real drawing to inspect rather than a flat picture, while there is nothing
 * here that could change it. The endpoint behind this page returns the drawing and nothing
 * else: no project, no owner, no identifiers.
 */
export function SharedPlanPage() {
    const { token } = useParams<{ token: string }>();
    const [name, setName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useDocumentStore((state) => state.load);
    const parseError = useDocumentStore((state) => state.error);
    const drawingId = useDocumentStore((state) => state.document.id);
    const scale = useDocumentStore((state) => state.document.settings.scale);
    const size = useViewportStore((state) => state.size);

    useEffect(() => {
        let cancelled = false;

        // Nothing here can select or edit, and a selection left over from an editor session in
        // the same tab would paint accent-coloured geometry into a read-only view.
        useEditorStore.getState().clearSelection();

        void api
            .get<Envelope<SharedDocumentPayload>>(`/api/share/${token ?? ''}`)
            .then((response) => {
                if (cancelled) return;

                load(response.data.drawing);
                setName(response.data.name);
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

    const framed = useRef<string | null>(null);

    useEffect(() => {
        if (name === null || size.width === 0 || size.height === 0) {
            return;
        }

        if (framed.current === drawingId) {
            return;
        }

        const viewport = useViewportStore.getState();
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds === null) {
            viewport.setViewport(
                centreOn({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { x: 0, y: 0 }, size),
            );
            framed.current = drawingId;

            return;
        }

        // Recorded only when the framing actually happened, so a canvas that was still
        // mid-layout gets another go rather than being written off as done.
        if (viewport.fit(bounds)) {
            framed.current = drawingId;
        }
    }, [name, drawingId, size]);

    function zoomToFit() {
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds !== null) {
            useViewportStore.getState().fit(bounds);
        }
    }

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
            <header className="border-line bg-surface flex items-center gap-3 border-b px-4">
                <Link to="/" className="rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>

                <span className="bg-line h-4 w-px" aria-hidden />

                <h1 className="text-ink text-[13px] font-medium">{name}</h1>

                <span className="text-ink-subtle ml-auto font-mono text-[11px]">
                    {formatScale(scale)} · read only
                </span>

                <button
                    type="button"
                    title="Zoom to fit  ·  Shift 1"
                    aria-label="Zoom to fit"
                    onClick={zoomToFit}
                    className="text-ink-muted hover:bg-sunken hover:text-ink flex size-7 items-center justify-center rounded-md transition-colors"
                >
                    <Maximize2 className="size-3.5" aria-hidden />
                </button>
            </header>

            <CanvasHost readOnly />
        </div>
    );
}
