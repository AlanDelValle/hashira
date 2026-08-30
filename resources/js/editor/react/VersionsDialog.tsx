import { useCallback, useEffect, useState } from 'react';

import { replaceDocument } from '@/editor/commands/command';
import { parseDocument } from '@/editor/model/document';
import { autosave } from '@/editor/persistence/autosave';
import {
    createVersion,
    fetchVersion,
    listVersions,
    type VersionSummary,
} from '@/editor/persistence/versions';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { formatRelativeTime } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextField } from '@/ui/TextField';

/**
 * Saved versions of the drawing.
 *
 * Restoring runs through a command, so going back to a version is itself undoable — a restore
 * is a decision someone can regret, and the drawing they were on should be one Ctrl+Z away
 * rather than gone.
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
    const [versions, setVersions] = useState<VersionSummary[] | null>(null);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State is only ever set from the promise callbacks: setting it synchronously here would
    // make the effect below cascade a render the moment the dialog opens.
    const refresh = useCallback(() => {
        void listVersions(projectId)
            .then((loaded) => {
                setVersions(loaded);
                setError(null);
            })
            .catch(() => setError('Could not load the versions of this drawing.'));
    }, [projectId]);

    useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open, refresh]);

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

    async function restore(version: VersionSummary) {
        setBusy(true);
        setError(null);

        try {
            const detail = await fetchVersion(projectId, version.id);
            const parsed = parseDocument(detail.drawing);

            if (!parsed.ok) {
                setError(parsed.reason);

                return;
            }

            const current = useDocumentStore.getState().document;

            runCommand(replaceDocument(current, parsed.document, 'Restore version'));
            useEditorStore.getState().clearSelection();
            onOpenChange(false);
        } catch {
            setError('Could not restore that version.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Versions"
            description="Snapshots you have saved of this drawing."
        >
            <div className="space-y-5">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                    className="flex items-end gap-2"
                >
                    <div className="flex-1">
                        <TextField
                            label="Save this version as"
                            value={label}
                            maxLength={120}
                            placeholder="Before the rework"
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </div>
                    <Button type="submit" variant="primary" busy={busy}>
                        Save
                    </Button>
                </form>

                {error !== null && (
                    <p role="alert" className="text-danger text-[13px]">
                        {error}
                    </p>
                )}

                <div className="border-line border-t">
                    {versions === null && (
                        <p className="text-ink-subtle py-6 text-center text-[13px]">Loading…</p>
                    )}

                    {versions !== null && versions.length === 0 && (
                        <p className="text-ink-subtle py-6 text-center text-[13px]">
                            No versions yet. Autosave keeps your latest work; a version is a point
                            you can come back to on purpose.
                        </p>
                    )}

                    {versions !== null && versions.length > 0 && (
                        <ul className="max-h-64 overflow-y-auto">
                            {versions.map((version) => (
                                <li
                                    key={version.id}
                                    className="border-line flex items-center justify-between gap-3 border-b py-2.5"
                                >
                                    <div className="min-w-0">
                                        <p className="text-ink truncate text-[13px]">
                                            {version.label ?? 'Untitled version'}
                                        </p>
                                        <p className="text-ink-subtle text-xs">
                                            {formatRelativeTime(version.createdAt)}
                                            {typeof version.author === 'string' &&
                                                ` · ${version.author}`}
                                        </p>
                                    </div>

                                    <Button
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => void restore(version)}
                                    >
                                        Restore
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </Modal>
    );
}
