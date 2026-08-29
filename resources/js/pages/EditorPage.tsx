import { ChevronLeft, Maximize2, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { documentBounds } from '@/editor/model/elements';
import { CanvasHost } from '@/editor/react/CanvasHost';
import { SidePanel } from '@/editor/react/SidePanel';
import { StatusBar } from '@/editor/react/StatusBar';
import { Toolbar } from '@/editor/react/Toolbar';
import { useHistory } from '@/editor/react/useHistory';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { centreOn, DEFAULT_ZOOM } from '@/editor/viewport/viewport';
import { useDocument } from '@/projects/useDocument';
import { cn } from '@/lib/cn';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Logo } from '@/ui/Logo';

export function EditorPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { document: payload, loading, error } = useDocument(projectId);

    const load = useDocumentStore((state) => state.load);
    const parseError = useDocumentStore((state) => state.error);
    const dropped = useDocumentStore((state) => state.dropped);
    const drawingId = useDocumentStore((state) => state.document.id);
    const size = useViewportStore((state) => state.size);

    useEffect(() => {
        if (payload !== null) {
            load(payload.drawing);
        }
    }, [payload, load]);

    // Frame the drawing once, when it and the canvas both exist. Re-framing on every change
    // would fight the person using it.
    const framed = useRef<string | null>(null);

    useEffect(() => {
        if (size.width === 0 || framed.current === drawingId) {
            return;
        }

        const viewportStore = useViewportStore.getState();
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds === null) {
            viewportStore.setViewport(
                centreOn({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { x: 0, y: 0 }, size),
            );
        } else {
            viewportStore.fit(bounds);
        }

        framed.current = drawingId;
    }, [drawingId, size]);

    if (loading) {
        return <FullPageSpinner label="Opening drawing" />;
    }

    if (error !== null || payload === null || parseError !== null) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p role="alert" className="text-ink text-sm">
                        {error ?? parseError ?? 'Could not open this drawing.'}
                    </p>
                    <Link
                        to="/projects"
                        className="text-ink-muted mt-4 inline-block rounded-sm text-sm underline"
                    >
                        Back to projects
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* The editor is a pointer-and-precision tool; a phone cannot give it a good home. */}
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6 lg:hidden">
                <div className="max-w-xs text-center">
                    <Logo className="text-ink-subtle mx-auto size-5" />
                    <p className="text-ink mt-4 text-sm">The editor needs a larger screen.</p>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        Drafting depends on precise pointing and a lot of visible sheet. Open this
                        project on a desktop display.
                    </p>
                    <Link
                        to="/projects"
                        className="text-ink-muted mt-5 inline-block rounded-sm text-sm underline"
                    >
                        Back to projects
                    </Link>
                </div>
            </div>

            <div className="bg-canvas hidden h-screen grid-rows-[3rem_1fr_1.75rem] lg:grid">
                <EditorHeader name={payload.name} />

                <div className="grid grid-cols-[2.75rem_1fr_15rem] overflow-hidden">
                    <Toolbar />
                    <div className="border-line border-r">
                        <CanvasHost />
                    </div>
                    <SidePanel />
                </div>

                <StatusBar />
            </div>

            {dropped.length > 0 && <DroppedNotice count={dropped.length} />}
        </>
    );
}

function EditorHeader({ name }: { name: string }) {
    const { canUndo, canRedo, undoLabel, redoLabel } = useHistory();

    function zoomToFit() {
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds !== null) {
            useViewportStore.getState().fit(bounds);
        }
    }

    return (
        <header className="border-line bg-surface flex items-center gap-3 border-b px-3">
            <Link
                to="/projects"
                className="text-ink-muted hover:bg-sunken hover:text-ink flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px]"
            >
                <ChevronLeft className="size-3.5" aria-hidden />
                Projects
            </Link>

            <span className="bg-line h-4 w-px" aria-hidden />

            <h1 className="text-ink text-[13px] font-medium">{name}</h1>

            <div className="ml-auto flex items-center gap-0.5">
                <HeaderButton
                    label={canUndo ? `Undo ${undoLabel ?? ''}`.trim() : 'Undo'}
                    disabled={!canUndo}
                    onClick={() => history.undo()}
                >
                    <Undo2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton
                    label={canRedo ? `Redo ${redoLabel ?? ''}`.trim() : 'Redo'}
                    disabled={!canRedo}
                    onClick={() => history.redo()}
                >
                    <Redo2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <span className="bg-line mx-1.5 h-4 w-px" aria-hidden />

                <HeaderButton label="Zoom to fit  ·  Shift 1" onClick={zoomToFit}>
                    <Maximize2 className="size-3.5" aria-hidden />
                </HeaderButton>
            </div>
        </header>
    );
}

function HeaderButton({
    label,
    disabled = false,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'flex size-7 items-center justify-center rounded-md transition-colors',
                disabled
                    ? 'text-ink-subtle/50 cursor-not-allowed'
                    : 'text-ink-muted hover:bg-sunken hover:text-ink',
            )}
        >
            {children}
        </button>
    );
}

/** Said once, quietly: a drawing that lost an element on load should not lose it silently. */
function DroppedNotice({ count }: { count: number }) {
    return (
        <div
            role="status"
            className="border-line bg-surface shadow-panel text-ink-muted fixed bottom-9 left-1/2 -translate-x-1/2 rounded-md border px-3 py-2 text-[13px]"
        >
            {count} {count === 1 ? 'element' : 'elements'} could not be read and{' '}
            {count === 1 ? 'was' : 'were'} left out of this drawing.
        </div>
    );
}
