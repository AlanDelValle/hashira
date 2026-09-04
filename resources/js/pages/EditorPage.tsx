import {
    ChevronLeft,
    FileInput,
    History,
    Import,
    Maximize2,
    Redo2,
    Share2,
    Undo2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { CanvasHost } from '@/editor/react/CanvasHost';
import { CommentDraft } from '@/editor/react/CommentDraft';
import { CommentsPanel } from '@/editor/react/CommentsPanel';
import { LibraryPanel } from '@/editor/react/LibraryPanel';
import { DxfImportDialog } from '@/editor/react/DxfImportDialog';
import { ExportDialog } from '@/editor/react/ExportDialog';
import { SaveStatusIndicator } from '@/editor/react/SaveStatusIndicator';
import { ShareDialog } from '@/editor/react/ShareDialog';
import { UnderlayDialog } from '@/editor/react/UnderlayDialog';
import { VersionsDialog } from '@/editor/react/VersionsDialog';
import { autosave } from '@/editor/persistence/autosave';
import { fetchThreads } from '@/editor/persistence/comments';
import { listUnderlays } from '@/editor/persistence/underlays';
import { ShortcutsDialog } from '@/editor/react/ShortcutsDialog';
import { SidePanel } from '@/editor/react/SidePanel';
import { TextDraft } from '@/editor/react/TextDraft';
import { StatusBar } from '@/editor/react/StatusBar';
import { Toolbar } from '@/editor/react/Toolbar';
import { useFrameOnce, zoomToDrawing } from '@/editor/react/framing';
import { useHistory } from '@/editor/react/useHistory';
import { useCommentsStore } from '@/editor/store/commentsStore';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useDocument } from '@/projects/useDocument';
import { registerBlocks } from '@/projects/useBlocks';
import { cn } from '@/lib/cn';
import { formatChord } from '@/lib/keys';
import { useMediaQuery } from '@/lib/useMediaQuery';
import type { ProjectRole } from '@/types/api';
import { Button } from '@/ui/Button';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Logo } from '@/ui/Logo';
import { SkipLink } from '@/ui/SkipLink';

/**
 * Only an owner or an editor is handed a drawing they can change. Somebody who was let into a
 * project to comment gets told so, rather than a full editor whose every save is refused —
 * and their own surface arrives with the comments themselves.
 */
function canEdit(role: ProjectRole | null): boolean {
    return role === 'owner' || role === 'editor';
}

export function EditorPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { document: payload, loading, error, retry } = useDocument(projectId);

    const load = useDocumentStore((state) => state.load);
    const parseError = useDocumentStore((state) => state.error);
    const dropped = useDocumentStore((state) => state.dropped);
    const drawingId = useDocumentStore((state) => state.document.id);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const libraryOpen = useEditorStore((state) => state.libraryOpen);
    const commentsOpen = useEditorStore((state) => state.tool === 'comment');
    const { user } = useAuth();

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

        /*
         * The conversations on this drawing. They are not part of the document and arrive on
         * their own, so a slow list never delays the plan appearing — and the panel says it is
         * loading rather than saying there is nothing to discuss.
         */
        const comments = useCommentsStore.getState();

        comments.clear();
        comments.begin();

        void fetchThreads(projectId)
            .then((threads) => useCommentsStore.getState().load(threads))
            .catch(() => useCommentsStore.getState().fail('Could not load the comments.'));

        // A selection left over from another project in this tab would name elements that no
        // longer exist, and the panels would be describing nothing.
        useEditorStore.getState().clearSelection();

        // `load` is synchronous, so the parsed document is already in the store and is the
        // right baseline: autosave must treat what just arrived as saved, not as an edit.
        const state = useDocumentStore.getState();

        // No autosave for a drawing this person may not change: it would queue a save the
        // policy is going to refuse, and report it as a conflict nobody can resolve.
        if (state.error === null && canEdit(payload.role)) {
            autosave.start(projectId, payload.revision, state.document);
        }

        return () => {
            autosave.stop();
            useCommentsStore.getState().clear();
        };
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

    useFrameOnce(drawingId);

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

    if (!canEdit(payload.role)) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p className="text-ink text-sm">
                        You can look at this drawing, but not change it.
                    </p>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        Ask whoever owns it for a link that can edit, and open that.
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

                <EditorHeader
                    name={payload.name}
                    projectId={projectId ?? ''}
                    owned={payload.role === 'owner'}
                />

                <div className="flex overflow-hidden">
                    <Toolbar />

                    {libraryOpen && <LibraryPanel />}

                    {/*
                     * The panel belongs to the tool, the way the library does: pressing K
                     * brings both the pin cursor and the list of what has already been said.
                     */}
                    {commentsOpen && (
                        <CommentsPanel
                            projectId={projectId ?? ''}
                            canComment
                            userId={user?.id ?? null}
                            isOwner={payload.role === 'owner'}
                        />
                    )}

                    <main id="sheet" className="border-line relative min-w-0 flex-1 border-r">
                        <CanvasHost />
                        <TextDraft />
                        <CommentDraft projectId={projectId ?? ''} />
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

function EditorHeader({
    name,
    projectId,
    owned,
}: {
    name: string;
    projectId: string;
    /** Sharing is the owner's alone, so an editor who was let in is not offered it. */
    owned: boolean;
}) {
    const { canUndo, canRedo, undoLabel, redoLabel } = useHistory();
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [underlayOpen, setUnderlayOpen] = useState(false);
    const [dxfOpen, setDxfOpen] = useState(false);

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

                <HeaderButton label="Zoom to fit" shortcut="Shift 1" onClick={zoomToDrawing}>
                    <Maximize2 className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton label="Versions" onClick={() => setVersionsOpen(true)}>
                    <History className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton label="Trace over a PDF" onClick={() => setUnderlayOpen(true)}>
                    <FileInput className="size-3.5" aria-hidden />
                </HeaderButton>

                <HeaderButton label="Import a DXF" onClick={() => setDxfOpen(true)}>
                    <Import className="size-3.5" aria-hidden />
                </HeaderButton>

                <span className="bg-line mx-1.5 h-4 w-px" aria-hidden />

                <ExportDialog />

                {owned && (
                    <HeaderButton label="Share" onClick={() => setShareOpen(true)}>
                        <Share2 className="size-3.5" aria-hidden />
                    </HeaderButton>
                )}
            </div>

            <VersionsDialog
                projectId={projectId}
                open={versionsOpen}
                onOpenChange={setVersionsOpen}
            />

            {owned && (
                <ShareDialog projectId={projectId} open={shareOpen} onOpenChange={setShareOpen} />
            )}

            <DxfImportDialog open={dxfOpen} onOpenChange={setDxfOpen} />

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
