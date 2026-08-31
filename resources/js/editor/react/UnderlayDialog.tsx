import { useRef, useState } from 'react';

import { addElements, replaceLayers } from '@/editor/commands/command';
import { createUnderlay, UNDERLAY_LAYER } from '@/editor/model/factories';
import type { Layer } from '@/editor/model/types';
import { formatLength } from '@/editor/model/units';
import { openPdf, type PdfPage } from '@/editor/persistence/pdfPages';
import { uploadUnderlay } from '@/editor/persistence/underlays';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

/**
 * Importing a page to trace over.
 *
 * Choosing the file lists its pages with their real sizes; choosing a page rasterises that one
 * and nothing else. Uploading a whole survey before knowing whether page four was wanted is
 * both slower and ruder than reading it in the browser first.
 *
 * The page lands at its true size, centred on the origin, on a layer of its own — so it can be
 * hidden or locked without touching anything drawn on top of it.
 */
export function UnderlayDialog({
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
            title="Trace over a PDF"
            description="The page is placed at its own size, on a layer of its own, and is never exported."
        >
            {/* Unmounted with the dialog, so each opening starts from no file at all. */}
            <UnderlayForm projectId={projectId} onOpenChange={onOpenChange} />
        </Modal>
    );
}

function UnderlayForm({
    projectId,
    onOpenChange,
}: {
    projectId: string;
    onOpenChange: (open: boolean) => void;
}) {
    const [pages, setPages] = useState<PdfPage[] | null>(null);
    const [chosen, setChosen] = useState(1);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const document = useRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
    const file = useRef<HTMLInputElement>(null);

    async function read(picked: File): Promise<void> {
        setBusy(true);
        setError(null);

        try {
            document.current?.close();

            const opened = await openPdf(picked);

            document.current = opened;
            setPages(opened.pages);
            setChosen(1);
            setName(picked.name);
        } catch {
            setError('That file could not be read as a PDF.');
            setPages(null);
        } finally {
            setBusy(false);
        }
    }

    async function place(): Promise<void> {
        const opened = document.current;
        const page = pages?.find((entry) => entry.number === chosen);

        if (opened === null || page === undefined) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const image = await opened.render(page.number);
            const saved = await uploadUnderlay(projectId, {
                name,
                page: page.number,
                width: page.width,
                height: page.height,
                image,
            });

            ensureLayer();

            const element = createUnderlay(saved.id, { x: 0, y: 0 }, saved.width, saved.height);

            runCommand(addElements([element], 'Underlay'));
            useEditorStore.getState().select([element.id]);
            onOpenChange(false);
        } catch {
            setError('That page could not be imported.');
        } finally {
            setBusy(false);
        }
    }

    const page = pages?.find((entry) => entry.number === chosen);

    return (
        <div className="space-y-4">
            <div>
                <Button
                    size="sm"
                    busy={busy && pages === null}
                    onClick={() => file.current?.click()}
                >
                    Choose a PDF
                </Button>
                <input
                    ref={file}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                        const picked = event.target.files?.[0];

                        if (picked !== undefined) void read(picked);

                        event.target.value = '';
                    }}
                />
            </div>

            {pages !== null && (
                <>
                    <p className="text-ink text-[13px]">
                        {name} — {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                    </p>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="underlay-page"
                            className="text-ink block text-[13px] font-medium"
                        >
                            Page
                        </label>
                        <select
                            id="underlay-page"
                            value={chosen}
                            onChange={(event) => setChosen(Number(event.target.value))}
                            className="border-line-strong bg-surface text-ink hover:border-ink-subtle h-9.5 w-full rounded-md border px-2 text-sm"
                        >
                            {pages.map((entry) => (
                                <option key={entry.number} value={entry.number}>
                                    Page {entry.number} — {formatLength(entry.width, 'mm')} ×{' '}
                                    {formatLength(entry.height, 'mm')}
                                </option>
                            ))}
                        </select>
                    </div>

                    {page !== undefined && (
                        <p className="text-ink-subtle text-xs">
                            It will be placed {formatLength(page.width, 'm')} ×{' '}
                            {formatLength(page.height, 'm')} at the drawing origin. If the PDF was
                            plotted to a scale, set the size in the properties panel afterwards.
                        </p>
                    )}
                </>
            )}

            {error !== null && <p className="text-danger text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                    variant="primary"
                    busy={busy && pages !== null}
                    disabled={pages === null}
                    onClick={() => void place()}
                >
                    Place page
                </Button>
            </div>
        </div>
    );
}

/**
 * A page goes on its own layer, made the first time one is imported.
 *
 * It is not part of the standard five: a drawing that never traces anything should not carry
 * an empty layer for the possibility. Its order is below every other, so the drawing is always
 * on top of the paper.
 */
function ensureLayer(): void {
    const { layers } = useDocumentStore.getState().document;

    if (layers.some((layer) => layer.id === UNDERLAY_LAYER)) {
        return;
    }

    const underlay: Layer = {
        id: UNDERLAY_LAYER,
        name: 'Underlay',
        color: '#5F636B',
        visible: true,
        locked: false,
        order: Math.min(...layers.map((layer) => layer.order), 0) - 1,
    };

    runCommand(replaceLayers(layers, [underlay, ...layers], 'Underlay layer'));
}
