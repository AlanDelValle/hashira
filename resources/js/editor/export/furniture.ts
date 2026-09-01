import type * as PdfLib from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import type { Sheet, TitleBlock } from '@/editor/model/types';
import { MARK_ASPECT, markPaths } from '@/lib/mark';

import {
    PT_PER_MM,
    scaleBarMetres,
    TITLE_BLOCK_HEIGHT_MM,
    type SheetAside,
    type SheetLayout,
} from './sheet';

/**
 * The sheet's furniture: the border round the drawing, the strip beside it, the stamp under it.
 *
 * A drawing on a bare page is a picture of a screen. What makes it a sheet is the border that
 * says where the paper's business ends, and a title block that answers, without being asked,
 * the questions anybody holding a print has: what is this, whose is it, at what scale, which
 * revision, and who do I go back to. So the block is a ruled stamp with labelled fields rather
 * than a line of grey text along the bottom — the labels are what let a reader take "C" as a
 * revision instead of as a guess.
 *
 * Beside the drawing goes what it cannot say in geometry: the notes, and a legend naming the
 * layers a reader is looking at. That strip is paid for in drawing area — `layoutSheet` takes
 * it off the frame — so it is only reserved when there is something to print in it.
 *
 * Fields nobody filled in are left out entirely, labels included. A stamp promising a client
 * and delivering a gap is worse than one that never raised the subject.
 */

/** The parts of pdf-lib this needs. It is imported at the moment somebody exports, not before. */
export type StampKit = Pick<typeof PdfLib, 'rgb' | 'setCharacterSpacing'>;

export interface StampFonts {
    regular: PDFFont;
    bold: PDFFont;
}

export interface SheetContent {
    /** The drawing's name, and the largest thing in the block. */
    title: string;
    /** The document it came out of, when that is not the same string as the title. */
    subtitle: string;
    titleBlock: TitleBlock | undefined;
    sheet: Sheet;
    /** Which page of a set this is, when the set has more than one. */
    label: string | undefined;
    /** What goes in the strip beside the drawing, or null when this sheet has no strip. */
    aside: SheetAside | null;
}

/** Ink, and the two greys everything else on the sheet is drawn in. */
const INK: readonly [number, number, number] = [0.09, 0.1, 0.11];
const MUTED: readonly [number, number, number] = [0.37, 0.39, 0.42];
const RULE: readonly [number, number, number] = [0.66, 0.68, 0.71];
const PAPER: readonly [number, number, number] = [1, 1, 1];

/** Pen widths, in millimetres of paper. */
const BORDER_MM = 0.25;
const HEAVY_MM = 0.5;
const HAIRLINE_MM = 0.15;

const IDENTITY_MM = 26;
const PADDING_MM = 3.2;
/** Where the facts split into two rows. The title's cell is not divided — it is one statement. */
const ROW_SPLIT_MM = 13;
/** The title needs room to be a title; below this the fact columns give way instead. */
const TITLE_MIN_MM = 45;
/**
 * How long the scale bar is allowed to get.
 *
 * Its length is dictated by the scale — 5 m at 1:50 is 100 mm of paper, and the bar cannot lie
 * about that. What it can do is measure fewer metres, so a wide sheet gets a bar somebody can
 * still read past rather than a black rule halfway across the stamp.
 */
const SCALE_BAR_MAX_MM = 56;

/** The sizes a title is tried at, largest first, before it has to be cut short. */
const TITLE_SMALLEST_PT = 10;
const TITLE_SIZES_PT = [13, 11.5, TITLE_SMALLEST_PT];

/** The strip's rhythm, in millimetres of paper. */
const HEADING_HEIGHT_MM = 8.4;
const NOTE_LINE_MM = 3.5;
const NOTE_GAP_MM = 1.8;
const LEGEND_ROW_MM = 4.6;
const SWATCH_MM = 7;

const LABEL_PT = 5.5;
const NOTE_PT = 7;
const LABEL_TRACKING_PT = 0.5;
const VALUE_PT = 8;
const SUBTITLE_PT = 7.5;

/** A labelled field. Two of them stack into one column of the stamp. */
interface Field {
    label: string;
    value: string;
    /** The scale is the one fact a reader hunts for, so it is the one printed in bold. */
    strong?: boolean;
}

interface Column {
    /** Wider for the fields that hold names, narrower for the ones that hold codes. */
    weight: number;
    fields: Field[];
}

export function drawSheetFurniture(
    kit: StampKit,
    page: PDFPage,
    fonts: StampFonts,
    layout: SheetLayout,
    content: SheetContent,
): void {
    const pen = penFor(kit, page, layout);
    const left = layout.box.x;
    const right = left + layout.box.width;
    const top = layout.frame.y + layout.frame.height;
    const bottom = top + TITLE_BLOCK_HEIGHT_MM;

    // The border: one box round the drawing, the strip and the stamp together, so they read as
    // one sheet rather than as a drawing with things stuck around it.
    pen.rect(left, layout.box.y, layout.box.width, layout.box.height, {
        border: pen.color(RULE),
        width: BORDER_MM,
    });

    // The rule that divides them, in full ink: everything above it is the drawing, everything
    // below it is what the drawing says about itself.
    pen.line(left, top, right, top, HEAVY_MM, pen.color(INK));

    if (layout.aside !== null && content.aside !== null) {
        drawAside(pen, fonts, layout.aside, content.aside);
    }

    const columns = factColumns(content, layout);
    const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
    const available = layout.box.width - IDENTITY_MM - TITLE_MIN_MM;
    const unit = Math.min(
        clamp(layout.box.width * 0.115, 24, 46),
        totalWeight === 0 ? Number.POSITIVE_INFINITY : available / totalWeight,
    );

    const factsWidth = unit * totalWeight;
    const titleWidth = layout.box.width - IDENTITY_MM - factsWidth;

    drawIdentity(pen, fonts, left, top);
    drawTitle(pen, fonts, layout, content, left + IDENTITY_MM, top, titleWidth);

    pen.line(left + IDENTITY_MM, top, left + IDENTITY_MM, bottom, HAIRLINE_MM, pen.color(RULE));

    let x = left + IDENTITY_MM + titleWidth;

    // The facts are ruled off the title and off each other, because a stamp is a table
    // somebody reads by position — not a sentence.
    pen.line(x, top, x, bottom, HAIRLINE_MM, pen.color(RULE));

    for (const [index, column] of columns.entries()) {
        const width = unit * column.weight;

        if (index > 0) {
            pen.line(x, top, x, bottom, HAIRLINE_MM, pen.color(RULE));
        }

        // Two facts stack, and are ruled apart. One on its own takes the whole cell and sits in
        // the middle of it, so a column half of which nobody filled in is not an empty box.
        if (column.fields.length === 2) {
            pen.line(
                x,
                top + ROW_SPLIT_MM,
                x + width,
                top + ROW_SPLIT_MM,
                HAIRLINE_MM,
                pen.color(RULE),
            );
        }

        for (const [row, field] of column.fields.entries()) {
            const offset = column.fields.length === 2 ? row * ROW_SPLIT_MM : ROW_SPLIT_MM / 2;

            drawField(pen, fonts, field, x, top + offset, width);
        }

        x += width;
    }
}

/**
 * The strip beside the drawing: the notes, and the legend under them.
 *
 * The legend is set at the foot of the strip, against the stamp, because it is a key rather
 * than a statement — a reader goes to it with a question, and always finds it in the same
 * corner. The notes run from the top and stop where the legend starts: a note that would print
 * over the key is cut short, and says so.
 */
function drawAside(
    pen: Pen,
    fonts: StampFonts,
    box: { x: number; y: number; width: number; height: number },
    content: SheetAside,
): void {
    const inner = box.width - PADDING_MM * 2;
    const x = box.x + PADDING_MM;

    // The strip is ruled off the drawing rather than boxed: the border already closes the
    // sheet, and a second box here would fence the notes off from what they are about.
    pen.line(box.x, box.y, box.x, box.y + box.height, HAIRLINE_MM, pen.color(RULE));

    const legendHeight =
        content.legend.length === 0 ? 0 : HEADING_HEIGHT_MM + content.legend.length * LEGEND_ROW_MM;

    const floor = box.y + box.height - PADDING_MM - legendHeight;

    if (content.notes.length > 0) {
        drawNotes(pen, fonts, content.notes, x, box.y + PADDING_MM, inner, floor);
    }

    if (content.legend.length > 0) {
        drawLegend(pen, fonts, content.legend, x, floor, inner);
    }
}

/**
 * The notes, numbered when there is more than one of them.
 *
 * A single note numbered "1." is a list of one pretending to be a schedule; several unnumbered
 * are impossible to refer to on site, which is the whole point of writing them on the drawing
 * rather than in an email.
 */
function drawNotes(
    pen: Pen,
    fonts: StampFonts,
    notes: readonly string[],
    x: number,
    top: number,
    width: number,
    floor: number,
): void {
    let y = heading(pen, fonts, 'Notes', x, top, width);

    const numbered = notes.length > 1;
    const indent = numbered ? 5 : 0;

    for (const [index, note] of notes.entries()) {
        const lines = wrap(note, fonts.regular, NOTE_PT, width - indent, pen);

        for (const [line, text] of lines.entries()) {
            // Out of strip. What is left is cut off at the last line that fits, marked, and
            // the rest is not silently dropped halfway down a sentence.
            if (y + NOTE_LINE_MM > floor) {
                pen.text('…', x + indent, y, {
                    size: NOTE_PT,
                    font: fonts.regular,
                    color: pen.color(MUTED),
                });

                return;
            }

            if (line === 0 && numbered) {
                pen.text(`${index + 1}.`, x, y, {
                    size: NOTE_PT,
                    font: fonts.regular,
                    color: pen.color(MUTED),
                });
            }

            pen.text(text, x + indent, y, {
                size: NOTE_PT,
                font: fonts.regular,
                color: pen.color(INK),
            });

            y += NOTE_LINE_MM;
        }

        y += NOTE_GAP_MM;
    }
}

/** The layers on this page, in the colours they were drawn in. */
function drawLegend(
    pen: Pen,
    fonts: StampFonts,
    legend: readonly { name: string; color: string }[],
    x: number,
    top: number,
    width: number,
): void {
    let y = heading(pen, fonts, 'Layers', x, top, width);

    for (const entry of legend) {
        // A rule in the layer's own colour rather than a swatch: what the reader is matching
        // it against is a line on the drawing, not a filled area.
        pen.line(x, y - 1, x + SWATCH_MM, y - 1, 0.5, pen.hex(entry.color));

        pen.text(
            pen.fit(entry.name, fonts.regular, NOTE_PT, width - SWATCH_MM - 2.4),
            x + SWATCH_MM + 2.4,
            y,
            { size: NOTE_PT, font: fonts.regular, color: pen.color(INK) },
        );

        y += LEGEND_ROW_MM;
    }
}

/** A label with a hairline under it. Returns the baseline the first line below it sits on. */
function heading(
    pen: Pen,
    fonts: StampFonts,
    text: string,
    x: number,
    top: number,
    width: number,
): number {
    pen.text(text.toUpperCase(), x, top + 3, {
        size: LABEL_PT,
        font: fonts.regular,
        color: pen.color(MUTED),
        tracking: LABEL_TRACKING_PT,
    });

    pen.line(x, top + 4.8, x + width, top + 4.8, HAIRLINE_MM, pen.color(RULE));

    return top + HEADING_HEIGHT_MM;
}

/**
 * A paragraph broken to a width, keeping whole words.
 *
 * A PDF has no notion of a text box: `drawText` sets a run where it is told and off the edge
 * of the page if that is where the run ends. So the breaking is done here, against the same
 * font metrics the run will be set in.
 */
function wrap(text: string, font: PDFFont, size: number, width: number, pen: Pen): string[] {
    const lines: string[] = [];
    let line = '';

    for (const word of text.split(/\s+/).filter((part) => part !== '')) {
        const candidate = line === '' ? word : `${line} ${word}`;

        if (line !== '' && font.widthOfTextAtSize(candidate, size) > width * PT_PER_MM) {
            lines.push(line);
            line = word;
            continue;
        }

        line = candidate;
    }

    if (line !== '') {
        // A single word longer than the strip has nowhere to break, so it is cut instead.
        lines.push(pen.fit(line, font, size, width));
    }

    return lines;
}

/**
 * What the stamp has to say, in the order it says it, with the empty fields dropped.
 *
 * Whichever of a column's two fields survives is drawn in the top row, so a stamp nobody has
 * filled in closes up rather than printing a row of blank boxes.
 */
function factColumns(content: SheetContent, layout: SheetLayout): Column[] {
    const block = content.titleBlock;
    const issued = block?.date.trim() ?? '';

    const columns: Column[] = [
        {
            weight: 1.4,
            fields: [
                { label: 'Project', value: block?.project ?? '' },
                { label: 'Client', value: block?.client ?? '' },
            ],
        },
        {
            weight: 1,
            fields: [
                { label: 'Drawn by', value: block?.drawnBy ?? '' },
                // The day it was issued, when somebody has said so. A drawing carries the date
                // it went out, not the date it happened to be printed.
                { label: 'Date', value: issued === '' ? today() : issued },
            ],
        },
        {
            weight: 0.85,
            fields: [
                { label: 'Scale', value: `1:${layout.scale}`, strong: true },
                { label: 'Size', value: `${content.sheet.size} ${content.sheet.orientation}` },
            ],
        },
        {
            weight: 0.95,
            fields: [
                { label: 'Sheet', value: content.label ?? '' },
                { label: 'Rev', value: block?.revision ?? '' },
            ],
        },
    ];

    return columns
        .map((column) => ({
            weight: column.weight,
            fields: column.fields.filter((field) => field.value.trim() !== ''),
        }))
        .filter((column) => column.fields.length > 0);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** A label over its value, in one cell of the stamp. */
function drawField(
    pen: Pen,
    fonts: StampFonts,
    field: Field,
    x: number,
    top: number,
    width: number,
): void {
    const inner = width - PADDING_MM * 2;

    pen.text(field.label.toUpperCase(), x + PADDING_MM, top + 4.8, {
        size: LABEL_PT,
        font: fonts.regular,
        color: pen.color(MUTED),
        tracking: LABEL_TRACKING_PT,
    });

    const font = field.strong === true ? fonts.bold : fonts.regular;

    pen.text(pen.fit(field.value, font, VALUE_PT, inner), x + PADDING_MM, top + 9.9, {
        size: VALUE_PT,
        font,
        color: pen.color(INK),
    });
}

/**
 * The drawing's own cell: what it is, where it came from, and a bar to measure it with.
 *
 * The scale bar sits here rather than off in a corner because it belongs to the ratio printed
 * two cells along — a stated ratio is only as good as the page it was printed on, and a bar
 * survives being photocopied at 94%.
 */
function drawTitle(
    pen: Pen,
    fonts: StampFonts,
    layout: SheetLayout,
    content: SheetContent,
    x: number,
    top: number,
    width: number,
): void {
    const inner = width - PADDING_MM * 2;

    // A long title is set smaller before it is cut short: a name a reader can still read is
    // worth more than a couple of points of size, and an ellipsis loses the end of a sentence
    // that often ends in the thing that distinguishes one sheet from the next.
    const size =
        TITLE_SIZES_PT.find(
            (candidate) =>
                fonts.bold.widthOfTextAtSize(content.title, candidate) <= inner * PT_PER_MM,
        ) ?? TITLE_SMALLEST_PT;

    pen.text(pen.fit(content.title, fonts.bold, size, inner), x + PADDING_MM, top + 9.2, {
        size,
        font: fonts.bold,
        color: pen.color(INK),
    });

    pen.text(
        pen.fit(content.subtitle, fonts.regular, SUBTITLE_PT, inner),
        x + PADDING_MM,
        top + 14.2,
        { size: SUBTITLE_PT, font: fonts.regular, color: pen.color(MUTED) },
    );

    drawScaleBar(
        pen,
        fonts,
        layout,
        x + PADDING_MM,
        top + 18.6,
        Math.min(inner - 4, SCALE_BAR_MAX_MM),
    );
}

/** A divided bar the length of a round number of metres, with its ends labelled under it. */
function drawScaleBar(
    pen: Pen,
    fonts: StampFonts,
    layout: SheetLayout,
    x: number,
    top: number,
    maxWidth: number,
): void {
    const metres = scaleBarMetres(layout.scale, maxWidth);
    const length = (metres * 1000) / layout.scale;
    const divisions = 4;
    const height = 1.4;

    for (let index = 0; index < divisions; index++) {
        pen.rect(x + (length * index) / divisions, top, length / divisions, height, {
            fill: pen.color(index % 2 === 0 ? INK : PAPER),
            border: pen.color(INK),
            width: HAIRLINE_MM,
        });
    }

    const style = { size: 6, font: fonts.regular, color: pen.color(MUTED) };

    pen.text('0', x, top + 4.8, { ...style, centreOn: x });
    pen.text(`${metres} m`, x + length, top + 4.8, { ...style, centreOn: x + length });
}

/**
 * The mark, and who made the thing.
 *
 * Small, grey and boxed off in the corner the way an office stamps its own sheets — except
 * quieter, because the drawing is somebody else's work and the tool that plotted it is a
 * footnote to it.
 */
function drawIdentity(pen: Pen, fonts: StampFonts, left: number, top: number): void {
    const height = 6.2;
    const centre = left + IDENTITY_MM / 2;

    pen.mark({ x: centre - (height * MARK_ASPECT) / 2, y: top + 5.4, height }, pen.color(MUTED));

    pen.text('Hashira', centre, top + 17.6, {
        size: 7.5,
        font: fonts.regular,
        color: pen.color(MUTED),
        centreOn: centre,
    });
}

interface TextStyle {
    size: number;
    font: PDFFont;
    color: RGB;
    /** Extra space between letters, in points. Labels are set wide; nothing else is. */
    tracking?: number;
    /** Where the run's middle should land, in page millimetres. */
    centreOn?: number;
}

interface Pen {
    color: (value: readonly [number, number, number]) => RGB;
    /** A layer's own colour, as the document writes it. */
    hex: (value: string) => RGB;
    line: (x1: number, y1: number, x2: number, y2: number, width: number, color: RGB) => void;
    rect: (
        x: number,
        y: number,
        width: number,
        height: number,
        style: { fill?: RGB; border?: RGB; width?: number },
    ) => void;
    text: (value: string, x: number, baseline: number, style: TextStyle) => void;
    mark: (placement: { x: number; y: number; height: number }, color: RGB) => void;
    fit: (value: string, font: PDFFont, size: number, maxWidth: number) => string;
}

/**
 * Drawing on the page in millimetres measured down from its top-left corner, which is how a
 * sheet is laid out and dimensioned. A PDF measures in points up from the bottom, and doing
 * that conversion at every call site is how a title block ends up half a millimetre out.
 */
function penFor(kit: StampKit, page: PDFPage, layout: SheetLayout): Pen {
    const mm = (value: number) => value * PT_PER_MM;
    const fromTop = (value: number) => (layout.page.height - value) * PT_PER_MM;

    return {
        color: ([r, g, b]) => kit.rgb(r, g, b),

        hex: (value) => {
            const match = /^#?([\da-f]{6})$/i.exec(value.trim());

            if (match?.[1] === undefined) {
                return kit.rgb(INK[0], INK[1], INK[2]);
            }

            const int = Number.parseInt(match[1], 16);

            return kit.rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
        },

        line: (x1, y1, x2, y2, width, color) => {
            page.drawLine({
                start: { x: mm(x1), y: fromTop(y1) },
                end: { x: mm(x2), y: fromTop(y2) },
                thickness: mm(width),
                color,
            });
        },

        rect: (x, y, width, height, style) => {
            page.drawRectangle({
                x: mm(x),
                y: fromTop(y + height),
                width: mm(width),
                height: mm(height),
                ...(style.fill === undefined ? {} : { color: style.fill }),
                ...(style.border === undefined
                    ? {}
                    : { borderColor: style.border, borderWidth: mm(style.width ?? HAIRLINE_MM) }),
            });
        },

        text: (value, x, baseline, style) => {
            if (value === '') return;

            const tracking = style.tracking ?? 0;

            // Tracking is a text-state parameter rather than an argument to drawing a run, so
            // it is switched on around the run and off again — and counted into the width by
            // hand, since the font's own metrics know nothing about it.
            if (tracking !== 0) {
                page.pushOperators(kit.setCharacterSpacing(tracking));
            }

            const width =
                style.font.widthOfTextAtSize(value, style.size) + tracking * (value.length - 1);

            page.drawText(value, {
                x: style.centreOn === undefined ? mm(x) : mm(style.centreOn) - width / 2,
                y: fromTop(baseline),
                size: style.size,
                font: style.font,
                color: style.color,
            });

            if (tracking !== 0) {
                page.pushOperators(kit.setCharacterSpacing(0));
            }
        },

        mark: (placement, color) => {
            // Placed on the same y-down page the drawing itself is put through, so the mark
            // lands in the millimetres the rest of this file measures in.
            for (const data of markPaths({
                x: mm(placement.x),
                y: mm(placement.y),
                height: mm(placement.height),
            })) {
                page.drawSvgPath(data, { x: 0, y: mm(layout.page.height), color, borderWidth: 0 });
            }
        },

        fit: (value, font, size, maxWidth) => {
            const max = mm(maxWidth);

            if (font.widthOfTextAtSize(value, size) <= max) {
                return value;
            }

            let kept = value;

            while (kept.length > 1 && font.widthOfTextAtSize(`${kept}…`, size) > max) {
                kept = kept.slice(0, -1);
            }

            return `${kept.trimEnd()}…`;
        },
    };
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}
