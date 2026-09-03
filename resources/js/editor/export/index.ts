import { documentBounds, drawnLayers } from '@/editor/model/elements';
import { resolveSheet } from '@/editor/model/sheets';
import type { HashiraDocument, Layer, Sheet } from '@/editor/model/types';
import { buildScene } from '@/editor/scene/build';
import type { SceneLayer, ScenePalette } from '@/editor/scene/types';

import { sceneToDxf } from './dxf';
import { sceneToPdf, type PrintedPage } from './pdf';
import type { LegendEntry } from './sheet';
import { sceneToPng } from './png';
import { sceneToSvg } from './svg';

/**
 * Exporting a drawing.
 *
 * Every format starts from the same scene the screen draws, so a PDF cannot disagree with what
 * was on the canvas. Hidden layers stay hidden — hiding a layer is a statement about the
 * drawing, not a preview trick.
 *
 * A PDF is paper, so it is the only format that knows about sheets: it prints the pages that
 * were chosen, and can put each layer on a page of its own so the prints lay over each other.
 * The others have no page — SVG and PNG are the whole drawing as a picture of it, and DXF is
 * the whole drawing at full size, as geometry for somebody else's software to edit.
 */

/** Ink on white paper, whatever the interface theme happens to be. */
const EXPORT_PALETTE: ScenePalette = {
    ink: '#17191d',
    subtle: '#5f636b',
    roomFill: '#f2f5fc',
    sheet: '#ffffff',
};

const PAPER = '#ffffff';

export type ExportFormat = 'svg' | 'png' | 'pdf' | 'dxf';

export interface ExportOptions {
    pngLongestEdgePx?: number;
    /** Which sheets to print, in order. Omitted means the drawing's first sheet. */
    sheetIds?: readonly string[];
    /**
     * A page per visible layer, on each sheet chosen.
     *
     * Every page is laid out from the same extent, so a stack of layer prints registers —
     * which is the only reason anybody asks for one.
     */
    perLayer?: boolean;
}

export interface ExportResult {
    blob: Blob;
    filename: string;
}

function slug(name: string, fallback: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^\da-z]+/g, '-')
            .replace(/^-|-$/g, '') || fallback
    );
}

function fileStem(document: HashiraDocument): string {
    return slug(document.name, 'drawing');
}

/** The sheets an export was asked for, in the order they were asked for. */
function chosenSheets(document: HashiraDocument, ids: readonly string[] | undefined): Sheet[] {
    const sheets = document.settings.sheets;

    if (ids === undefined || ids.length === 0) {
        const first = resolveSheet(sheets, null);

        return first === undefined ? [] : [first];
    }

    return ids.flatMap((id) => {
        const found = sheets.find((sheet) => sheet.id === id);

        return found === undefined ? [] : [found];
    });
}

/**
 * What actually gets printed, page by page.
 *
 * `nameSheets` is whether the drawing has more than one page in the first place: on a drawing
 * that has only ever had one, writing "Sheet 1" in the title block tells the reader nothing.
 *
 * Each page carries the layers it is a drawing of, in the colours they were drawn in, for the
 * legend beside it. A page printed as one layer is a drawing of one layer, and its legend says
 * so rather than listing the whole drawing's. They come from `drawnLayers` rather than from
 * the scene, because the canvas decides whether to reserve the strip from the same list — and
 * a sheet outline that reserves a strip the print does not is an outline that lies.
 */
function printedPages(
    sheets: readonly Sheet[],
    scene: readonly SceneLayer[],
    perLayer: boolean,
    nameSheets: boolean,
    layers: readonly Layer[],
): PrintedPage[] {
    const pages: PrintedPage[] = [];

    const entries = (id?: string): LegendEntry[] =>
        layers
            .filter((layer) => id === undefined || layer.id === id)
            .map((layer) => ({ name: layer.name, color: layer.color }));

    for (const sheet of sheets) {
        if (!perLayer) {
            pages.push({
                sheet,
                layers: scene,
                legend: entries(),
                ...(nameSheets ? { label: sheet.name } : {}),
            });
            continue;
        }

        for (const layer of scene) {
            // A layer with nothing on it is a blank page nobody asked for.
            if (layer.primitives.length === 0) continue;

            pages.push({
                sheet,
                layers: [layer],
                legend: entries(layer.id),
                label: nameSheets ? `${sheet.name} · ${layer.name}` : layer.name,
            });
        }
    }

    return pages;
}

/** The drawing as primitives, on white paper. Every format starts here. */
function sceneFor(document: HashiraDocument): SceneLayer[] {
    return buildScene(document.elements, document.layers, {
        palette: EXPORT_PALETTE,
        unit: document.settings.unit,
        // A hatch is specified on the sheet, so what it comes to in the world depends on the
        // ratio it is plotted at. Paper has no zoom, which is why nothing is culled here.
        scale: document.settings.scale,
    });
}

/**
 * How many pages a PDF of these choices comes to.
 *
 * For a dialog that has to say so before it runs. It builds the scene to answer, because
 * "how many layers have something on them" is a question only the scene can settle — a layer
 * holding nothing but an underlay looks occupied and prints blank.
 */
export function pdfPageCount(document: HashiraDocument, options: ExportOptions = {}): number {
    return printedPages(
        chosenSheets(document, options.sheetIds),
        sceneFor(document),
        options.perLayer === true,
        false,
        drawnLayers(document),
    ).length;
}

/** Null when there is nothing to export — an empty drawing has no extent to frame. */
export async function exportDocument(
    document: HashiraDocument,
    format: ExportFormat,
    options: ExportOptions = {},
): Promise<ExportResult | null> {
    const bounds = documentBounds(document);

    if (bounds === null) {
        return null;
    }

    const scene = sceneFor(document);
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

        case 'dxf':
            return {
                blob: new Blob([sceneToDxf(scene, { bounds })], { type: 'application/dxf' }),
                filename: `${stem}.dxf`,
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

        case 'pdf': {
            const perLayer = options.perLayer === true;
            const sheets = chosenSheets(document, options.sheetIds);
            const pages = printedPages(
                sheets,
                scene,
                perLayer,
                document.settings.sheets.length > 1,
                drawnLayers(document),
            );

            // Nothing to print: every layer chosen was empty, or every sheet asked for has
            // since been deleted. A PDF with no pages in it is not a file anybody can open.
            if (pages.length === 0) {
                return null;
            }

            return {
                blob: await sceneToPdf(pages, {
                    bounds,
                    title,
                    subtitle: document.name === title ? '' : document.name,
                    titleBlock: document.settings.titleBlock,
                    notes: document.settings.notes,
                }),
                filename: pdfName(stem, sheets, document.settings.sheets.length, perLayer),
            };
        }
    }
}

/**
 * A file named after what is in it: the sheet, when one page of several was picked out, and
 * nothing extra when the export is simply the drawing.
 */
function pdfName(stem: string, chosen: readonly Sheet[], total: number, perLayer: boolean): string {
    const only = chosen.length === 1 && total > 1 ? chosen[0] : undefined;
    const parts = [
        stem,
        ...(only === undefined ? [] : [slug(only.name, 'sheet')]),
        ...(perLayer ? ['layers'] : []),
    ];

    return `${parts.join('-')}.pdf`;
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
