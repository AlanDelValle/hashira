import { Download } from 'lucide-react';
import { useState } from 'react';

import { exportDocument, saveBlob, type ExportFormat } from '@/editor/export';
import { PNG_SIZES } from '@/editor/export/png';
import { useDocumentStore } from '@/editor/store/documentStore';
import { Menu, MenuItem, MenuSeparator } from '@/ui/Menu';

/**
 * Exporting.
 *
 * All three formats come from the same scene the canvas draws, so what is downloaded is what
 * was on screen. An empty drawing has no extent to frame, so there is nothing to export and it
 * says so rather than handing over a blank page.
 */
export function ExportMenu() {
    const [error, setError] = useState<string | null>(null);

    async function run(format: ExportFormat, pngLongestEdgePx?: number) {
        setError(null);

        try {
            const result = await exportDocument(
                useDocumentStore.getState().document,
                format,
                pngLongestEdgePx === undefined ? {} : { pngLongestEdgePx },
            );

            if (result === null) {
                setError('There is nothing in this drawing to export yet.');

                return;
            }

            saveBlob(result.blob, result.filename);
        } catch {
            setError('That export could not be produced.');
        }
    }

    return (
        <>
            <Menu
                trigger={
                    <button
                        type="button"
                        title="Export"
                        aria-label="Export"
                        className="text-ink-muted hover:bg-sunken hover:text-ink flex size-7 items-center justify-center rounded-md transition-colors"
                    >
                        <Download className="size-3.5" aria-hidden />
                    </button>
                }
            >
                <MenuItem onSelect={() => void run('pdf')}>PDF — to print at scale</MenuItem>
                <MenuItem onSelect={() => void run('svg')}>SVG — vector, layered</MenuItem>

                <MenuSeparator />

                {PNG_SIZES.map((size) => (
                    <MenuItem key={size.px} onSelect={() => void run('png', size.px)}>
                        {`PNG — ${size.label.toLowerCase()} (${size.px} px)`}
                    </MenuItem>
                ))}
            </Menu>

            {error !== null && (
                <div
                    role="alert"
                    className="border-line bg-surface shadow-panel text-ink-muted fixed bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border px-3 py-2 text-[13px]"
                >
                    {error}
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="text-ink underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </>
    );
}
