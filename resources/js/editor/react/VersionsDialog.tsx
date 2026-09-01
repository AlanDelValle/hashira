import { Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { replaceDocument } from '@/editor/commands/command';
import { changeBounds, diffDocuments, type ElementChange } from '@/editor/model/diff';
import { parseDocument } from '@/editor/model/document';
import { makeLookup } from '@/editor/model/elements';
import type { HashiraDocument } from '@/editor/model/types';
import { autosave } from '@/editor/persistence/autosave';
import {
    createVersion,
    fetchVersion,
    listVersions,
    type VersionSummary,
} from '@/editor/persistence/versions';
import type { ReviewContent } from '@/editor/render/review';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextField } from '@/ui/TextField';

import { ReviewCanvas, type ReviewCanvasHandle } from './ReviewCanvas';
import { VersionChanges } from './VersionChanges';

/**
 * Saved versions of the drawing: the list, the drawing each one holds, and what changed.
 *
 * Three things happen here, and they are the three things somebody actually does with history.
 * **Look** — pick a version and it is drawn, on a surface of its own, without disturbing the
 * drawing that is open. **Compare** — a version opens showing what changed between it and the
 * one before it, which for the current drawing means "what have I done since I last saved a
 * version", the question this gets opened for most of the time. **Restore** — go back to the
 * one on screen, through a command, so the drawing being left behind is one Ctrl+Z away rather
 * than gone.
 *
 * A comparison only ever runs forwards: what is compared against is always older than what is
 * on show, so "drawn" and "deleted" mean what they say.
 *
 * Everything below lives inside the dialog rather than around it, so closing it takes the
 * fetched versions with it. They are copies of something the server holds, and a long editing
 * session should not quietly accumulate every drawing it has ever looked at.
 */
export function VersionsDialog({
    projectId,
    open,
    onOpenChange,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            size="xl"
            title="Versions"
            description="Snapshots of this drawing, what each one holds, and what changed between them."
        >
            <VersionHistory projectId={projectId} onClose={() => onOpenChange(false)} />
        </Modal>
    );
}

/** The drawing as it is now, which is a version like any other as far as this is concerned. */
const CURRENT = 'current';

interface Row {
    id: string;
    title: string;
    caption: string;
}

function VersionHistory({ projectId, onClose }: { projectId: string; onClose: () => void }) {
    const [versions, setVersions] = useState<VersionSummary[] | null>(null);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [viewing, setViewing] = useState<string>(CURRENT);

    /*
     * What the person picked to compare against, if they picked anything. `undefined` means
     * they have not, and the default below applies — which is what makes choosing a version
     * show what it changed without anyone having to say so twice.
     */
    const [chosen, setChosen] = useState<string | null | undefined>(undefined);

    /*
     * Version payloads, parsed, held for as long as this is on screen. Comparing means walking
     * up and down the list, and fetching a whole drawing again every time one is looked at
     * twice would make that crawl.
     */
    const [drawings, setDrawings] = useState<Record<string, HashiraDocument>>({});

    const current = useDocumentStore((state) => state.document);
    const canvas = useRef<ReviewCanvasHandle>(null);

    const refresh = useCallback(() => {
        void listVersions(projectId)
            .then((loaded) => {
                setVersions(loaded);
                setError(null);
            })
            .catch(() => setError('Could not load the versions of this drawing.'));
    }, [projectId]);

    useEffect(refresh, [refresh]);

    const rows = useMemo((): Row[] => {
        const saved = (versions ?? []).map((version) => ({
            id: version.id,
            title: version.label ?? 'Untitled version',
            caption:
                typeof version.author === 'string'
                    ? `${formatRelativeTime(version.createdAt)} · ${version.author}`
                    : formatRelativeTime(version.createdAt),
        }));

        return [{ id: CURRENT, title: 'Current drawing', caption: 'As it stands now' }, ...saved];
    }, [versions]);

    // Everything older than what is on show — the only things it can be compared against, and
    // the reason "drawn" never has to mean "drawn before this".
    const older = useMemo(() => {
        const index = rows.findIndex((row) => row.id === viewing);

        return index === -1 ? [] : rows.slice(index + 1);
    }, [rows, viewing]);

    const usable = chosen === null || older.some((row) => row.id === chosen);
    const since = chosen !== undefined && usable ? chosen : (older[0]?.id ?? null);

    useEffect(() => {
        const wanted = [viewing, since].filter(
            (id): id is string => id !== null && id !== CURRENT && !(id in drawings),
        );

        if (wanted.length === 0) {
            return;
        }

        let cancelled = false;

        void Promise.all(
            wanted.map(async (id) => {
                const detail = await fetchVersion(projectId, id);

                return [id, parseDocument(detail.drawing)] as const;
            }),
        )
            .then((results) => {
                if (cancelled) return;

                const parsed: Record<string, HashiraDocument> = {};

                for (const [id, result] of results) {
                    if (result.ok) {
                        parsed[id] = result.document;
                    } else {
                        setError(result.reason);
                    }
                }

                setDrawings((held) => ({ ...held, ...parsed }));
            })
            .catch(() => {
                if (!cancelled) setError('Could not open that version.');
            });

        return () => {
            cancelled = true;
        };
    }, [projectId, viewing, since, drawings]);

    const shown = viewing === CURRENT ? current : (drawings[viewing] ?? null);
    const against = since === null ? null : (drawings[since] ?? null);

    const content = useMemo((): ReviewContent | null => {
        if (shown === null) {
            return null;
        }

        return against === null
            ? { drawing: shown, against: null, diff: null }
            : { drawing: shown, against, diff: diffDocuments(against, shown) };
    }, [shown, against]);

    const diff = content?.diff ?? null;

    async function save() {
        setBusy(true);
        setError(null);

        try {
            // Any unsaved work goes up first, so the snapshot is of what is on screen and not
            // of whatever the server happened to be holding.
            autosave.flush();

            await createVersion(projectId, label.trim() === '' ? null : label.trim());
            setLabel('');
            refresh();
        } catch {
            setError('Could not save this version.');
        } finally {
            setBusy(false);
        }
    }

    function restore() {
        if (shown === null || viewing === CURRENT) {
            return;
        }

        runCommand(replaceDocument(current, shown, 'Restore version'));
        useEditorStore.getState().clearSelection();
        onClose();
    }

    function look(change: ElementChange) {
        if (content === null || content.against === null) {
            return;
        }

        canvas.current?.frame(
            changeBounds(
                change,
                makeLookup(content.against.elements),
                makeLookup(content.drawing.elements),
            ),
        );
    }

    const viewingRow = rows.find((row) => row.id === viewing);
    const anythingHidden = [content?.drawing, content?.against].some(
        (drawing) => drawing?.layers.some((layer) => !layer.visible) ?? false,
    );

    return (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
            <div className="flex min-w-0 flex-col gap-4">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                    className="flex items-end gap-2"
                >
                    <div className="min-w-0 flex-1">
                        <TextField
                            label="Save this version as"
                            value={label}
                            maxLength={120}
                            placeholder="Before the rework"
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </div>
                    <Button type="submit" variant="primary" size="sm" busy={busy}>
                        Save
                    </Button>
                </form>

                {error !== null && (
                    <p role="alert" className="text-danger text-[13px]">
                        {error}
                    </p>
                )}

                <div className="border-line min-h-0 border-t pt-1">
                    {versions === null ? (
                        <p className="text-ink-subtle py-6 text-center text-[13px]">Loading…</p>
                    ) : (
                        <ul className="max-h-80 overflow-y-auto">
                            {rows.map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        aria-current={row.id === viewing}
                                        onClick={() => {
                                            setViewing(row.id);
                                            setChosen(undefined);
                                        }}
                                        className={cn(
                                            'w-full rounded-sm px-2 py-1.5 text-left',
                                            row.id === viewing
                                                ? 'bg-accent-soft'
                                                : 'hover:bg-sunken',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'block truncate text-[13px]',
                                                row.id === viewing
                                                    ? 'text-accent-strong'
                                                    : 'text-ink',
                                            )}
                                        >
                                            {row.title}
                                        </span>
                                        <span className="text-ink-subtle block text-xs">
                                            {row.caption}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {versions !== null && versions.length === 0 && (
                        <p className="text-ink-subtle px-2 py-3 text-[13px]">
                            No versions yet. Autosave keeps your latest work; a version is a point
                            you can come back to on purpose.
                        </p>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label htmlFor="version-since" className="text-ink-muted text-[13px]">
                        Changes since
                    </label>

                    <select
                        id="version-since"
                        value={since ?? ''}
                        disabled={older.length === 0}
                        onChange={(event) =>
                            setChosen(event.target.value === '' ? null : event.target.value)
                        }
                        className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-7 w-56 rounded-sm border px-1 text-[12px] transition-colors disabled:opacity-60"
                    >
                        <option value="">Nothing — just this version</option>
                        {older.map((row) => (
                            <option key={row.id} value={row.id}>
                                {row.title} · {row.caption}
                            </option>
                        ))}
                    </select>

                    {diff !== null && <Legend />}

                    <button
                        type="button"
                        title="Zoom to fit"
                        aria-label="Zoom to fit"
                        onClick={() => canvas.current?.frameAll()}
                        className="text-ink-muted hover:bg-sunken hover:text-ink ml-auto flex size-7 items-center justify-center rounded-md transition-colors"
                    >
                        <Maximize2 className="size-3.5" aria-hidden />
                    </button>
                </div>

                <div className="h-72">
                    <ReviewCanvas
                        ref={canvas}
                        content={content}
                        label={reviewLabel(viewingRow?.title, diff !== null)}
                    />
                </div>

                {anythingHidden && (
                    <p className="text-ink-subtle text-xs">
                        Hidden layers are drawn here — a change out of sight is still a change.
                    </p>
                )}

                <div className="max-h-44 min-h-0 overflow-y-auto">
                    {content === null ? (
                        <p className="text-ink-subtle py-6 text-center text-[13px]">
                            Opening this version…
                        </p>
                    ) : diff === null ? (
                        <p className="text-ink-subtle py-6 text-center text-[13px]">
                            Nothing to compare against. Choose an earlier version above to see what
                            changed.
                        </p>
                    ) : (
                        <VersionChanges diff={diff} layers={content.drawing.layers} onPick={look} />
                    )}
                </div>

                <div className="border-line flex items-center justify-end gap-3 border-t pt-3">
                    {diff !== null && !diff.empty && (
                        <p className="text-ink-subtle mr-auto text-[13px]">
                            {diff.counts.added} drawn · {diff.counts.changed} edited ·{' '}
                            {diff.counts.removed} deleted
                        </p>
                    )}

                    <Button
                        size="sm"
                        disabled={busy || viewing === CURRENT || shown === null}
                        onClick={restore}
                    >
                        Restore this version
                    </Button>
                </div>
            </div>
        </div>
    );
}

function reviewLabel(title: string | undefined, comparing: boolean): string {
    const name = title ?? 'A version';

    return comparing ? `${name}, with what changed marked on it` : `${name} of this drawing`;
}

/** What the marks on the drawing mean — as a sign as well as a colour. */
function Legend() {
    const items = [
        { sign: '+', tone: 'text-positive', word: 'drawn' },
        { sign: '~', tone: 'text-caution', word: 'edited' },
        { sign: '−', tone: 'text-danger', word: 'deleted' },
    ];

    return (
        <ul className="flex items-center gap-3">
            {items.map((item) => (
                <li key={item.word} className="text-ink-subtle flex items-baseline gap-1 text-xs">
                    <span aria-hidden className={cn('font-mono', item.tone)}>
                        {item.sign}
                    </span>
                    {item.word}
                </li>
            ))}
        </ul>
    );
}
