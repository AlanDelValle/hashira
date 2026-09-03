import type * as PdfLib from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import { toDegrees } from '@/editor/geometry/angle';
import type { Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import type { Sheet, TextAlign, TitleBlock } from '@/editor/model/types';
import type { SceneLayer, ScenePrimitive, Stroke } from '@/editor/scene/types';

import { drawSheetFurniture, type StampFonts, type StampKit } from './furniture';
import { toPathData, type PathTransform } from './path';
import { layoutSheet, PT_PER_MM, sheetAside, type LegendEntry } from './sheet';

/**
 * PDF export.
 *
 * A real page at a real scale, drawn as vectors rather than a picture of the screen — so it
 * prints crisply and can be measured with a ruler. The scale is never quietly adjusted to make
 * a drawing fit: it steps to the next standard ratio, the title block says which one, and a
 * scale bar gives the reader a way to check even if the page was resized on the way to them.
 *
 * What surrounds the drawing — the border, the notes beside it, the title block — is drawn by
 * `furniture.ts`. This file is the geometry; that one is the paperwork.
 */

/**
 * The parts of pdf-lib the helpers below need.
 *
 * pdf-lib is around 350 kB, and most sessions never export a PDF — so it is imported at the
 * moment someone asks for one rather than sitting in the bundle everybody downloads. That
 * means the module cannot be referenced at the top level, hence passing what is needed down.
 */
type PdfKit = Pick<typeof PdfLib, 'rgb' | 'degrees'>;

/**
 * One printed page: a sheet, and what is drawn on it.
 *
 * Splitting a drawing across pages — one per sheet, or one per layer so the prints can be
 * laid over each other — is a decision about what to print, not about how to print it, so it
 * is made before anything gets here. What this file guarantees is that every page is laid out
 * from the same extent, which is what makes a set of layer prints register when stacked.
 */
export interface PrintedPage {
    sheet: Sheet;
    layers: readonly SceneLayer[];
    /**
     * Which page this is, written in the title block: the sheet's name, the layer's, or both.
     * Left out for a drawing printed on one page, where naming it says nothing the reader did
     * not already know.
     */
    label?: string;
    /**
     * The layers this page is a drawing of, for the legend beside it — which is per page and
     * not per drawing, because a page printed as one layer is a drawing of one layer.
     */
    legend?: readonly LegendEntry[];
}

export interface PdfOptions {
    /** The drawing's extent. Every page is laid out from it, so the set registers. */
    bounds: Bounds;
    title: string;
    /** Shown in the title block beside the title. */
    subtitle?: string;
    /** What the title block says beyond the title. Empty fields are simply not printed. */
    titleBlock?: TitleBlock;
    /** What the drawing says in words, one note to a line. */
    notes?: string;
}

export async function sceneToPdf(
    pages: readonly PrintedPage[],
    options: PdfOptions,
): Promise<Blob> {
    const { PDFDocument, StandardFonts, ...operators } = await import('pdf-lib');
    const kit: PdfKit = { rgb: operators.rgb, degrees: operators.degrees };

    const document = await PDFDocument.create();
    document.setTitle(options.title);
    document.setProducer('Hashira');

    // Two weights, because a title block without one is a list rather than a hierarchy. The
    // drawing itself is set in the regular face at whatever size its own text elements ask for.
    const fonts: StampFonts = {
        regular: await document.embedFont(StandardFonts.Helvetica),
        bold: await document.embedFont(StandardFonts.HelveticaBold),
    };

    const stamp: StampKit = {
        rgb: operators.rgb,
        setCharacterSpacing: operators.setCharacterSpacing,
    };

    for (const page of pages) {
        drawPage(kit, stamp, operators, document, fonts, page, options);
    }

    const bytes = await document.save();

    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** The operators used to clip a page, which the helpers below do not need. */
type Clipping = Pick<
    typeof PdfLib,
    'clip' | 'endPath' | 'popGraphicsState' | 'pushGraphicsState' | 'rectangle'
>;

function drawPage(
    kit: PdfKit,
    stamp: StampKit,
    clipping: Clipping,
    document: PdfLib.PDFDocument,
    fonts: StampFonts,
    printed: PrintedPage,
    options: PdfOptions,
): void {
    const { clip, endPath, popGraphicsState, pushGraphicsState, rectangle } = clipping;

    // What goes beside the drawing decides how much page the drawing gets, so it is settled
    // before the page is laid out rather than drawn into whatever room is left over.
    const aside = sheetAside(options.notes ?? '', printed.legend ?? []);
    const layout = layoutSheet(options.bounds, printed.sheet, aside !== null);
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

    /*
     * The drawing is clipped to its frame, always.
     *
     * A sheet looking at one part of a plan is a window, and what a window does not show has
     * to stop at the glass: without this, a wall running off the side of the page carries on
     * across the margin and straight through the title block. A sheet framing the whole
     * drawing has nothing outside the frame to cut, so the clip costs it nothing.
     */
    page.pushOperators(
        pushGraphicsState(),
        rectangle(
            layout.frame.x * PT_PER_MM,
            (layout.page.height - layout.frame.y - layout.frame.height) * PT_PER_MM,
            layout.frame.width * PT_PER_MM,
            layout.frame.height * PT_PER_MM,
        ),
        clip(),
        endPath(),
    );

    for (const layer of printed.layers) {
        for (const primitive of layer.primitives) {
            drawPrimitive(kit, page, fonts.regular, primitive, transform, pageHeightPt);
        }
    }

    page.pushOperators(popGraphicsState());

    drawSheetFurniture(stamp, page, fonts, layout, {
        title: options.title,
        subtitle: options.subtitle ?? '',
        titleBlock: options.titleBlock,
        sheet: printed.sheet,
        label: printed.label,
        aside,
    });
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
                  borderWidth: strokeWidthInPoints(stroke),
                  borderLineCap: stroke.cap === 'butt' ? 0 : 1,
                  ...strokeDashInPoints(stroke),
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
function strokeWidthInPoints(stroke: Stroke): number {
    return stroke.width * PT_PER_MM;
}

/**
 * A dash pattern, in points, or nothing at all for a line with no gaps in it.
 *
 * Measured on the sheet like the pen weight beside it, so the page needs no scale to convert
 * it — unlike the SVG, whose coordinates are world millimetres and which has to take the
 * pattern up with them.
 */
function strokeDashInPoints(stroke: Stroke): { borderDashArray?: number[] } {
    const dash = stroke.dash ?? null;

    return dash === null || dash.length === 0
        ? {}
        : { borderDashArray: dash.map((mm) => mm * PT_PER_MM) };
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
