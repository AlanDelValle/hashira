import { ChevronLeft, FileInput, History, Maximize2, Redo2, Share2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { documentBounds } from '@/editor/model/elements';
import { CanvasHost } from '@/editor/react/CanvasHost';
import { LibraryPanel } from '@/editor/react/LibraryPanel';
import { ExportMenu } from '@/editor/react/ExportMenu';
import { SaveStatusIndicator } from '@/editor/react/SaveStatusIndicator';
import { ShareDialog } from '@/editor/react/ShareDialog';
import { UnderlayDialog } from '@/editor/react/UnderlayDialog';
import { VersionsDialog } from '@/editor/react/VersionsDialog';
import { autosave } from '@/editor/persistence/autosave';
import { listUnderlays } from '@/editor/persistence/underlays';
import { ShortcutsDialog } from '@/editor/react/ShortcutsDialog';
import { SidePanel } from '@/editor/react/SidePanel';
import { TextDraft } from '@/editor/react/TextDraft';
import { StatusBar } from '@/editor/react/StatusBar';
import { Toolbar } from '@/editor/react/Toolbar';
import { useHistory } from '@/editor/react/useHistory';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { centreOn, DEFAULT_ZOOM } from '@/editor/viewport/viewport';
import { useDocument } from '@/projects/useDocument';
import { registerBlocks } from '@/projects/useBlocks';
import { cn } from '@/lib/cn';
import { formatChord } from '@/lib/keys';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Button } from '@/ui/Button';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Logo } from '@/ui/Logo';
import { SkipLink } from '@/ui/SkipLink';

export function EditorPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { document: payload, loading, error, retry } = useDocument(projectId);

    const load = useDocumentStore((state) => state.load);
    const parseError = useDocumentStore((state) => state.error);
    const dropped = useDocumentStore((state) => state.dropped);
    const drawingId = useDocumentStore((state) => state.document.id);
    const size = useViewportStore((state) => state.size);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const libraryOpen = useEditorStore((state) => state.libraryOpen);

    // Matches the `lg` breakpoint. Below it the editor is not merely hidden, it is not built.
    const roomToDraw = useMediaQuery('(min-width: 64rem)');

    useEffect(() => {
        if (payload === null || projectId === undefined) {
            return;
        }

        // The blocks before the drawing: a plan stores an id and a size for each block on it,
        // so the definitions have to be resolvable by the time the first frame is painted.
        registerBlocks(payload.blocks);
        load(payload.drawing);

        // Where the pages traced over in this project live. Nothing waits on it: a drawing
        // opens now, and the paper underneath it appears when it arrives.
        void listUnderlays(projectId).catch(() => {
            /* An underlay that will not load is drawn as its own dashed outline. */
        });

        // A selection left over from another project in this tab would name elements that no
        // longer exist, and the panels would be describing nothing.
        useEditorStore.getState().clearSelection();

        // `load` is synchronous, so the parsed document is already in the store and is the
        // right baseline: autosave must treat what just arrived as saved, not as an edit.
        const state = useDocumentStore.getState();

        if (state.error === null) {
            autosave.start(projectId, payload.revision, state.document);
        }

        return () => autosave.stop();
    }, [payload, projectId, load]);

    useEffect(() => {
        function warnIfUnsaved(event: BeforeUnloadEvent) {
            if (autosave.isDirty()) {
                event.preventDefault();
            }
        }

        window.addEventListener('beforeunload', warnIfUnsaved);

        return () => window.removeEventListener('beforeunload', warnIfUnsaved);
    }, []);

    // Frame the drawing once, when it and the canvas both exist. Re-framing on every change
    // would fight the person using it.
    const framed = useRef<string | null>(null);

    useEffect(() => {
        if (size.width === 0 || size.height === 0 || framed.current === drawingId) {
            return;
        }

        const viewportStore = useViewportStore.getState();
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds === null) {
            viewportStore.setViewport(
                centreOn({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { x: 0, y: 0 }, size),
            );
            framed.current = drawingId;

            return;
        }

        // Recorded only when the framing actually happened, so a canvas that was still
        // mid-layout gets another go rather than being written off as done.
        if (viewportStore.fit(bounds)) {
            framed.current = drawingId;
        }
    }, [drawingId, size]);

    if (loading) {
        return <FullPageSpinner label="Opening drawing" />;
    }

    if (error !== null || payload === null || parseError !== null) {
        // A drawing that arrived but would not parse is not going to parse on a second try;
        // a request that never arrived might. Only one of the two gets a retry.
        const worthRetrying = parseError === null;

        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p role="alert" className="text-ink text-sm">
                        {error ?? parseError ?? 'Could not open this drawing.'}
                    </p>

                    {worthRetrying && (
                        <p className="text-ink-muted mt-1.5 text-sm">
                            Nothing has been lost — the drawing is still on the server.
                        </p>
                    )}

                    <div className="mt-5 flex items-center justify-center gap-3">
                        {worthRetrying && (
                            <Button variant="secondary" size="sm" onClick={retry}>
                                Try again
                            </Button>
                        )}

                        <Link
                            to="/projects"
                            className="text-ink-muted rounded-sm text-sm underline"
                        >
                            Back to projects
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // The editor is a pointer-and-precision tool; a phone cannot give it a good home.
    if (!roomToDraw) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
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
        );
    }

    return (
        <>
            <div className="bg-canvas grid h-screen grid-rows-[3rem_1fr_1.75rem]">
                <SkipLink to="sheet">Skip to the drawing</SkipLink>

                <EditorHeader name={payload.name} projectId={projectId ?? ''} />

                <div className="flex overflow-hidden">
                    <Toolbar />

                    {libraryOpen && <LibraryPanel />}

                    <main id="sheet" className="border-line relative min-w-0 flex-1 border-r">
                        <CanvasHost />
                        <TextDraft />
                        {elementCount === 0 && <EmptySheet />}
                    </main>

                    <div className="w-60 shrink-0">
                        <SidePanel />
                    </div>
                </div>

                <StatusBar />
            </div>

            <ShortcutsDialog />

            {dropped.length > 0 && <DroppedNotice count={dropped.length} />}
        </>
    );
}

function EditorHeader({ name, projectId }: { name: string; projectId: string }) {
    const { canUndo, canRedo, undoLabel, redoLabel } = useHistory();
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [underlayOpen, setUnderlayOpen] = useState(false);

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

            <SaveStatusIndicator />

            <div className="ml-auto flex items-center gap-0.5">
                <HeaderButton
                    label={canUndo ? `Undo ${undoLabel ?? ''}`.trim() : 'Undo'}
                    shortcut={formatChord(['Mod', 'Z'])}
                    disabled={!canUndo}
                    onClick={() => history.undo()}
                >
                    <Undo2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton
                    label={canRedo ? `Redo ${redoLabel ?? ''}`.trim() : 'Redo'}
                    shortcut={formatChord(['Mod', 'Shift', 'Z'])}
                    disabled={!canRedo}
                    onClick={() => history.redo()}
                >
                    <Redo2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <span className="bg-line mx-1.5 h-4 w-px" aria-hidden />

                <HeaderButton label="Zoom to fit" shortcut="Shift 1" onClick={zoomToFit}>
                    <Maximize2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton label="Versions" onClick={() => setVersionsOpen(true)}>
                    <History className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton label="Trace over a PDF" onClick={() => setUnderlayOpen(true)}>
                    <FileInput className="size-3.5" aria-hidden />
                </HeaderButton>

                <span className="bg-line mx-1.5 h-4 w-px" aria-hidden />

                <ExportMenu />

                <HeaderButton label="Share" onClick={() => setShareOpen(true)}>
                    <Share2 className="size-3.5" aria-hidden />
                </HeaderButton>
            </div>

            <VersionsDialog
                projectId={projectId}
                open={versionsOpen}
                onOpenChange={setVersionsOpen}
            />

            <ShareDialog projectId={projectId} open={shareOpen} onOpenChange={setShareOpen} />

            <UnderlayDialog
                projectId={projectId}
                open={underlayOpen}
                onOpenChange={setUnderlayOpen}
            />
        </header>
    );
}

function HeaderButton({
    label,
    shortcut,
    disabled = false,
    onClick,
    children,
}: {
    label: string;
    shortcut?: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            title={shortcut === undefined ? label : `${label}  ·  ${shortcut}`}
            aria-label={label}
            aria-keyshortcuts={shortcut}
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

/**
 * An empty sheet, said out loud.
 *
 * Not a marketing panel and not a tutorial: the two facts someone needs at that moment, which
 * are that the drawing really is empty and which key starts a wall.
 */
function EmptySheet() {
    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs text-center">
                <p className="text-ink-muted text-sm">This sheet is empty.</p>
                <p className="text-ink-subtle mt-1.5 text-[13px]">
                    Press <Key>W</Key> and click twice to draw a wall, or pick a tool from the left.{' '}
                    <Key>?</Key> lists every shortcut.
                </p>
            </div>
        </div>
    );
}

function Key({ children }: { children: ReactNode }) {
    return (
        <kbd className="border-line-strong bg-surface text-ink-muted mx-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border px-1 font-mono text-[11px]">
            {children}
        </kbd>
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
