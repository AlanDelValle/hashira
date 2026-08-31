import type * as PdfLib from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import { toDegrees } from '@/editor/geometry/angle';
import type { Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import type { SheetOrientation, SheetSize, TextAlign } from '@/editor/model/types';
import type { SceneLayer, ScenePrimitive, Stroke } from '@/editor/scene/types';

import { toPathData, type PathTransform } from './path';
import { layoutSheet, scaleBarMetres, SHEET_MARGIN_MM, TITLE_BLOCK_HEIGHT_MM } from './sheet';

/**
 * PDF export.
 *
 * A real page at a real scale, drawn as vectors rather than a picture of the screen — so it
 * prints crisply and can be measured with a ruler. The scale is never quietly adjusted to make
 * a drawing fit: it steps to the next standard ratio, the title block says which one, and a
 * scale bar gives the reader a way to check even if the page was resized on the way to them.
 */

const PT_PER_MM = 72 / 25.4;

/**
 * The parts of pdf-lib the helpers below need.
 *
 * pdf-lib is around 350 kB, and most sessions never export a PDF — so it is imported at the
 * moment someone asks for one rather than sitting in the bundle everybody downloads. That
 * means the module cannot be referenced at the top level, hence passing what is needed down.
 */
type PdfKit = Pick<typeof PdfLib, 'rgb' | 'degrees'>;

export interface PdfOptions {
    bounds: Bounds;
    scale: number;
    sheet: { size: SheetSize; orientation: SheetOrientation };
    title: string;
    /** Shown in the title block beside the title. */
    subtitle?: string;
}

export async function sceneToPdf(
    layers: readonly SceneLayer[],
    options: PdfOptions,
): Promise<Blob> {
    const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
    const kit: PdfKit = { rgb, degrees };

    const layout = layoutSheet(
        options.bounds,
        options.sheet.size,
        options.sheet.orientation,
        options.scale,
    );

    const document = await PDFDocument.create();
    document.setTitle(options.title);
    document.setProducer('Hashira');

    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([layout.page.width * PT_PER_MM, layout.page.height * PT_PER_MM]);

    /*
     * Every coordinate is pre-transformed into points measured down from the top-left of the
     * page. pdf-lib then draws each path with no scaling of its own, which removes any question
     * of whether a line width was scaled along with the geometry.
     */
    const u = layout.unitsPerWorldMm;

    const toSheet = (p: Point): Point => ({
        x: (layout.frame.x + (p.x - layout.origin.x) * u) * PT_PER_MM,
        y: (layout.frame.y + (p.y - layout.origin.y) * u) * PT_PER_MM,
    });

    const transform: PathTransform = {
        point: toSheet,
        length: (mm) => mm * u * PT_PER_MM,
    };

    const pageHeightPt = layout.page.height * PT_PER_MM;

    for (const layer of layers) {
        for (const primitive of layer.primitives) {
            drawPrimitive(kit, page, font, primitive, transform, pageHeightPt, u);
        }
    }

    drawTitleBlock(kit, page, font, layout, options);

    const bytes = await document.save();

    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/**
 * Where a run of text has to start for its anchor to land on `at`.
 *
 * The canvas and the SVG both say "centre this on that point" and let the renderer work it
 * out — `textAlign`, `text-anchor`. A PDF has no such notion: `drawText` puts the start of the
 * baseline at the coordinates given and *then* rotates the run about that point, so the
 * exporter has to do the centring itself.
 *
 * Which means the shift has to travel along the text's own baseline rather than along the
 * page's x axis. Those are the same direction for horizontal text, which is why a plan full
 * of level labels looked right for as long as every dimension on it was horizontal: turn one
 * on its side and the value slid off its line, sideways by half its width and hanging past
 * one end, in the PDF alone.
 */
export function textOrigin(
    at: { x: number; y: number },
    width: number,
    align: TextAlign,
    rotation: number,
): { x: number; y: number } {
    const shift = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;

    if (shift === 0) {
        return at;
    }

    // The drawing's rotation is clockwise in a y-down world; the page is y-up, so the
    // baseline runs along (cos, -sin) of the same angle.
    return {
        x: at.x + shift * Math.cos(rotation),
        y: at.y - shift * Math.sin(rotation),
    };
}

function drawPrimitive(
    kit: PdfKit,
    page: PDFPage,
    font: PDFFont,
    primitive: ScenePrimitive,
    transform: PathTransform,
    pageHeightPt: number,
    unitsPerWorldMm: number,
): void {
    if (primitive.kind === 'text') {
        const at = transform.point(primitive.at);
        const size = transform.length(primitive.size);
        const width = font.widthOfTextAtSize(primitive.content, size);
        const origin = textOrigin(
            { x: at.x, y: pageHeightPt - at.y },
            width,
            primitive.align,
            primitive.rotation,
        );

        page.drawText(primitive.content, {
            x: origin.x,
            y: origin.y,
            size,
            font,
            color: toColor(kit, primitive.fill),
            // PDF measures angles counter-clockwise from a y-up origin; the drawing measures
            // them clockwise from a y-down one, so the sign flips.
            rotate: kit.degrees(-toDegrees(primitive.rotation)),
        });

        return;
    }

    const stroke = primitive.stroke;
    const fill = 'fill' in primitive ? (primitive.fill ?? null) : null;

    const border =
        stroke === null
            ? {}
            : {
                  borderColor: toColor(kit, stroke.color),
                  borderWidth: strokeWidthInPoints(stroke, unitsPerWorldMm),
                  borderLineCap: stroke.cap === 'butt' ? 0 : 1,
              };

    if (primitive.kind === 'circle' || primitive.kind === 'ellipse') {
        const centre = transform.point(primitive.centre);
        const common = {
            x: centre.x,
            y: pageHeightPt - centre.y,
            ...border,
            ...(fill === null ? {} : { color: toColor(kit, fill) }),
        };

        if (primitive.kind === 'circle') {
            page.drawCircle({ ...common, size: transform.length(primitive.radius) });
        } else {
            page.drawEllipse({
                ...common,
                xScale: transform.length(primitive.rx),
                yScale: transform.length(primitive.ry),
                // Same flip as the text above: the page measures angles the other way round.
                rotate: kit.degrees(-toDegrees(primitive.rotation)),
            });
        }

        return;
    }

    const data = toPathData(primitive, transform);

    if (data === null) {
        return;
    }

    page.drawSvgPath(data, {
        x: 0,
        y: pageHeightPt,
        ...border,
        ...(fill === null ? {} : { color: toColor(kit, fill) }),
    });
}

/** A pen is a width on the sheet; a world width is a real dimension and shrinks with the scale. */
function strokeWidthInPoints(stroke: Stroke, unitsPerWorldMm: number): number {
    const sheetMm =
        stroke.width.kind === 'pen' ? stroke.width.mm : stroke.width.mm * unitsPerWorldMm;

    return sheetMm * PT_PER_MM;
}

function drawTitleBlock(
    kit: PdfKit,
    page: PDFPage,
    font: PDFFont,
    layout: ReturnType<typeof layoutSheet>,
    options: PdfOptions,
): void {
    const ink = kit.rgb(0.09, 0.1, 0.11);
    const muted = kit.rgb(0.37, 0.39, 0.42);

    const top = layout.page.height - SHEET_MARGIN_MM - TITLE_BLOCK_HEIGHT_MM;
    const left = SHEET_MARGIN_MM;
    const right = layout.page.width - SHEET_MARGIN_MM;

    const mm = (value: number) => value * PT_PER_MM;
    const fromTop = (value: number) => (layout.page.height - value) * PT_PER_MM;

    // A rule above the block rather than a box around it: the drawing is the subject, and a
    // full frame competes with it.
    page.drawLine({
        start: { x: mm(left), y: fromTop(top) },
        end: { x: mm(right), y: fromTop(top) },
        thickness: 0.4 * PT_PER_MM,
        color: ink,
    });

    page.drawText(options.title, {
        x: mm(left),
        y: fromTop(top + 8),
        size: 10,
        font,
        color: ink,
    });

    if (options.subtitle !== undefined && options.subtitle !== '') {
        page.drawText(options.subtitle, {
            x: mm(left),
            y: fromTop(top + 14),
            size: 7,
            font,
            color: muted,
        });
    }

    const facts = [
        `1:${layout.scale}`,
        `${options.sheet.size} ${options.sheet.orientation}`,
        new Date().toISOString().slice(0, 10),
    ].join('     ');

    page.drawText(facts, {
        x: mm(right) - font.widthOfTextAtSize(facts, 8),
        y: fromTop(top + 8),
        size: 8,
        font,
        color: muted,
    });

    drawScaleBar(kit, page, font, layout, muted, ink);
}

/**
 * A divided bar the length of a round number of metres. A stated ratio is only as good as the
 * page it was printed on; a bar survives being photocopied at 94%.
 */
function drawScaleBar(
    kit: PdfKit,
    page: PDFPage,
    font: PDFFont,
    layout: ReturnType<typeof layoutSheet>,
    muted: RGB,
    ink: RGB,
): void {
    const metres = scaleBarMetres(layout.scale, layout.frame.width / 3);
    const lengthMm = (metres * 1000) / layout.scale;

    const left = SHEET_MARGIN_MM;
    const baseline = layout.page.height - SHEET_MARGIN_MM - 4;
    const height = 1.6;
    const divisions = 4;

    const mm = (value: number) => value * PT_PER_MM;
    const fromTop = (value: number) => (layout.page.height - value) * PT_PER_MM;

    for (let i = 0; i < divisions; i++) {
        const from = left + (lengthMm * i) / divisions;

        page.drawRectangle({
            x: mm(from),
            y: fromTop(baseline),
            width: mm(lengthMm / divisions),
            height: mm(height),
            color: i % 2 === 0 ? ink : kit.rgb(1, 1, 1),
            borderColor: ink,
            borderWidth: 0.2 * PT_PER_MM,
        });
    }

    const label = `0${' '.repeat(2)}—${' '.repeat(2)}${metres} m`;

    page.drawText(label, {
        x: mm(left + lengthMm + 3),
        y: fromTop(baseline + 0.2),
        size: 7,
        font,
        color: muted,
    });
}

/** `#rrggbb` into pdf-lib's colour, falling back to black rather than throwing on a surprise. */
function toColor(kit: PdfKit, value: string): RGB {
    const match = /^#?([\da-f]{6})$/i.exec(value.trim());

    if (match?.[1] === undefined) {
        return kit.rgb(0, 0, 0);
    }

    const int = Number.parseInt(match[1], 16);

    return kit.rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}
