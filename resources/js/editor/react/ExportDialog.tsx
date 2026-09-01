import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
    exportDocument,
    pdfPageCount,
    saveBlob,
    type ExportFormat,
    type ExportOptions,
} from '@/editor/export';
import { PNG_SIZES } from '@/editor/export/png';
import { resolveSheet } from '@/editor/model/sheets';
import { formatScale } from '@/editor/model/units';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { cn } from '@/lib/cn';

/**
 * Exporting.
 *
 * Every format comes from the same scene the canvas draws, so what is downloaded is what was
 * on screen. What differs between them is paper: a PDF is printed on the sheets that were
 * chosen, and can put each layer on a page of its own so the prints lay over one another. The
 * rest have no page, so they are the whole drawing and there is nothing here to choose.
 *
 * This is a dialog rather than a menu because those are choices, and a menu that has to
 * remember which sheets were ticked is a dialog wearing a menu's clothes.
 */
export function ExportDialog() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                title="Export"
                aria-label="Export"
                onClick={() => setOpen(true)}
                className="text-ink-muted hover:bg-sunken hover:text-ink flex size-7 items-center justify-center rounded-md transition-colors"
            >
                <Download className="size-3.5" aria-hidden />
            </button>

            {/* Unmounted with the dialog, so each opening starts from the sheet being worked on. */}
            <Modal open={open} onOpenChange={setOpen} title="Export">
                <ExportForm onDone={() => setOpen(false)} />
            </Modal>
        </>
    );
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
    { id: 'pdf', label: 'PDF', hint: 'Pages at a real scale, to print' },
    { id: 'dxf', label: 'DXF', hint: 'Geometry, to carry on drawing elsewhere' },
    { id: 'svg', label: 'SVG', hint: 'Vector, layers intact' },
    { id: 'png', label: 'PNG', hint: 'A picture of the drawing' },
];

function ExportForm({ onDone }: { onDone: () => void }) {
    const drawing = useDocumentStore((state) => state.document);
    const activeSheetId = useEditorStore((state) => state.activeSheetId);

    const sheets = drawing.settings.sheets;
    const active = resolveSheet(sheets, activeSheetId);

    const [format, setFormat] = useState<ExportFormat>('pdf');
    const [chosen, setChosen] = useState<string[]>(active === undefined ? [] : [active.id]);
    const [perLayer, setPerLayer] = useState(false);
    const [pngPx, setPngPx] = useState<number>(3000);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Kept in the drawing's own order however they were ticked, because that is the order the
    // pages come out in and a reader flicking through a print expects it.
    const ordered = useMemo(
        () => sheets.filter((sheet) => chosen.includes(sheet.id)).map((sheet) => sheet.id),
        [sheets, chosen],
    );

    const options: ExportOptions = { sheetIds: ordered, perLayer, pngLongestEdgePx: pngPx };

    // Counting means building the scene, so it is not done again for a change that cannot
    // alter the answer — ticking through PNG resolutions, for one.
    const pages = useMemo(
        () => (format === 'pdf' ? pdfPageCount(drawing, { sheetIds: ordered, perLayer }) : 1),
        [format, drawing, ordered, perLayer],
    );

    function toggle(id: string): void {
        setChosen((current) =>
            current.includes(id) ? current.filter((each) => each !== id) : [...current, id],
        );
    }

    async function run(): Promise<void> {
        setBusy(true);
        setError(null);

        try {
            const result = await exportDocument(drawing, format, options);

            if (result === null) {
                setError('There is nothing in this drawing to export yet.');

                return;
            }

            saveBlob(result.blob, result.filename);
            onDone();
        } catch {
            setError('That export could not be produced.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <fieldset>
                <legend className="text-ink-subtle pb-2 text-[11px] font-medium tracking-wide uppercase">
                    Format
                </legend>

                <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setFormat(option.id)}
                            aria-pressed={format === option.id}
                            className={cn(
                                'rounded-md border px-3 py-2 text-left transition-colors',
                                format === option.id
                                    ? 'border-accent bg-accent-soft'
                                    : 'border-line-strong hover:border-ink-subtle',
                            )}
                        >
                            <span
                                className={cn(
                                    'block text-[13px] font-medium',
                                    format === option.id ? 'text-accent' : 'text-ink',
                                )}
                            >
                                {option.label}
                            </span>
                            <span className="text-ink-subtle block text-[11px]">{option.hint}</span>
                        </button>
                    ))}
                </div>
            </fieldset>

            {format === 'pdf' && (
                <fieldset>
                    <legend className="text-ink-subtle pb-2 text-[11px] font-medium tracking-wide uppercase">
                        Sheets
                    </legend>

                    <ul className="border-line divide-line divide-y rounded-md border">
                        {sheets.map((sheet) => (
                            <li key={sheet.id}>
                                <label className="hover:bg-sunken flex cursor-pointer items-center gap-2.5 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={chosen.includes(sheet.id)}
                                        onChange={() => toggle(sheet.id)}
                                        className="accent-accent size-3.5"
                                    />
                                    <span className="text-ink flex-1 truncate text-[13px]">
                                        {sheet.name}
                                    </span>
                                    <span className="text-ink-subtle font-mono text-[11px]">
                                        {sheet.size} {sheet.orientation} ·{' '}
                                        {formatScale(sheet.scale)}
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>

                    <label className="text-ink-muted mt-3 flex cursor-pointer items-center gap-2.5 text-[13px]">
                        <input
                            type="checkbox"
                            checked={perLayer}
                            onChange={(event) => setPerLayer(event.target.checked)}
                            className="accent-accent size-3.5"
                        />
                        A page per layer
                    </label>

                    <p className="text-ink-subtle mt-1.5 pl-6 text-[12px]">
                        {perLayer
                            ? 'Each layer on its own page, all laid out the same, so the prints lay over each other.'
                            : 'Every layer on one page, as the drawing reads on screen.'}
                    </p>
                </fieldset>
            )}

            {format === 'png' && (
                <fieldset>
                    <legend className="text-ink-subtle pb-2 text-[11px] font-medium tracking-wide uppercase">
                        Resolution
                    </legend>

                    <div className="flex gap-2">
                        {PNG_SIZES.map((size) => (
                            <button
                                key={size.px}
                                type="button"
                                onClick={() => setPngPx(size.px)}
                                aria-pressed={pngPx === size.px}
                                className={cn(
                                    'flex-1 rounded-md border px-3 py-2 text-[13px] transition-colors',
                                    pngPx === size.px
                                        ? 'border-accent text-accent bg-accent-soft'
                                        : 'border-line-strong text-ink hover:border-ink-subtle',
                                )}
                            >
                                {size.label}
                                <span className="text-ink-subtle block font-mono text-[11px]">
                                    {size.px} px
                                </span>
                            </button>
                        ))}
                    </div>
                </fieldset>
            )}

            {format === 'svg' && (
                <p className="text-ink-muted text-[13px]">
                    The whole drawing, at {formatScale(drawing.settings.scale)}, with its layers
                    kept as groups. An SVG has no page, so there is no sheet to choose.
                </p>
            )}

            {format === 'dxf' && (
                <p className="text-ink-muted text-[13px]">
                    The whole drawing at full size, on its layers, as R12 geometry — no page and no
                    scale, because those are decisions about paper. Line weights and fills do not
                    survive the trip.
                </p>
            )}

            {error !== null && (
                <p role="alert" className="text-danger text-[13px]">
                    {error}
                </p>
            )}

            <div className="flex items-center justify-between gap-3">
                <span className="text-ink-subtle text-[12px]">
                    {format === 'pdf'
                        ? `${pages} ${pages === 1 ? 'page' : 'pages'}`
                        : 'One file, the whole drawing'}
                </span>

                <div className="flex gap-2">
                    <Button onClick={onDone}>Cancel</Button>
                    <Button
                        variant="primary"
                        busy={busy}
                        disabled={format === 'pdf' && pages === 0}
                        onClick={() => void run()}
                    >
                        {busy ? 'Exporting…' : 'Export'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
