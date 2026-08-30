import { expandBounds } from '@/editor/geometry/bbox';
import { documentBounds } from '@/editor/model/elements';
import type { HashiraDocument } from '@/editor/model/types';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';

import { sceneToPdf } from './pdf';
import { sceneToPng } from './png';
import { sceneToSvg } from './svg';

/**
 * Exporting a drawing.
 *
 * Every format starts from the same scene the screen draws, so a PDF cannot disagree with what
 * was on the canvas. Hidden layers stay hidden — hiding a layer is a statement about the
 * drawing, not a preview trick.
 */

/** Ink on white paper, whatever the interface theme happens to be. */
const EXPORT_PALETTE: ScenePalette = {
    ink: '#17191d',
    subtle: '#5f636b',
    roomFill: '#f2f5fc',
};

const PAPER = '#ffffff';

export type ExportFormat = 'svg' | 'png' | 'pdf';

export interface ExportResult {
    blob: Blob;
    filename: string;
}

function fileStem(document: HashiraDocument): string {
    const name = document.name.trim() === '' ? 'drawing' : document.name;

    return (
        name
            .toLowerCase()
            .replace(/[^\da-z]+/g, '-')
            .replace(/^-|-$/g, '') || 'drawing'
    );
}

/** Null when there is nothing to export — an empty drawing has no extent to frame. */
export async function exportDocument(
    document: HashiraDocument,
    format: ExportFormat,
    options: { pngLongestEdgePx?: number } = {},
): Promise<ExportResult | null> {
    const bounds = documentBounds(document);

    if (bounds === null) {
        return null;
    }

    const scene = buildScene(document.elements, document.layers, { palette: EXPORT_PALETTE });
    const stem = fileStem(document);
    const title = document.settings.title.trim() === '' ? document.name : document.settings.title;

    switch (format) {
        case 'svg':
            return {
                blob: new Blob(
                    [
                        sceneToSvg(scene, {
                            bounds,
                            scale: document.settings.scale,
                            background: PAPER,
                            title,
                        }),
                    ],
                    { type: 'image/svg+xml' },
                ),
                filename: `${stem}.svg`,
            };

        case 'png':
            return {
                blob: await sceneToPng(scene, {
                    bounds,
                    longestEdgePx: options.pngLongestEdgePx ?? 3000,
                    background: PAPER,
                }),
                filename: `${stem}.png`,
            };

        case 'pdf':
            return {
                blob: await sceneToPdf(scene, {
                    // A drawing that touches the frame edge reads as clipped even when it is
                    // not, so the extent is padded before the sheet is laid out.
                    bounds: expandBounds(bounds, Math.max(document.settings.scale * 4, 100)),
                    scale: document.settings.scale,
                    sheet: document.settings.sheet,
                    title,
                    subtitle: document.name === title ? '' : document.name,
                }),
                filename: `${stem}.pdf`,
            };
    }
}

/** Hand the file to the browser. */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();

    // Revoked on the next tick: revoking synchronously can cancel the download in some
    // browsers before it has started reading the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
