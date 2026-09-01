import { layoutSheet, sheetInWorld } from '@/editor/export/sheet';
import type { Bounds } from '@/editor/geometry/bbox';
import type { Sheet } from '@/editor/model/types';

import type { CanvasTheme } from './theme';

/**
 * The page, on the canvas.
 *
 * Paper is not drawing: a sheet holds no geometry, is not in the scene and is never exported
 * as ink. What it is, is the answer to "what actually prints" — so it is drawn as an outline
 * over the drawing rather than as part of it, in the same grey the interface uses for the
 * things it says about a drawing rather than the things in one.
 *
 * The rectangles come from the same layout function the PDF exporter uses, which is the whole
 * reason to draw this at all: a page on screen that was worked out separately would be a page
 * that agrees with the print until one of the two is changed. `aside` is that in miniature: a
 * strip of notes is paid for in drawing area, so an outline drawn without knowing whether the
 * print reserves one is an outline promising room the print does not have.
 */

/** The sheet's name, at a constant size on screen. */
const LABEL_PX = 11;
const LABEL_GAP_PX = 6;

export function paintSheetFrame(
    ctx: CanvasRenderingContext2D,
    sheet: Sheet,
    bounds: Bounds | null,
    theme: CanvasTheme,
    px: number,
    aside: boolean,
): void {
    // A sheet that frames the whole drawing has nothing to frame until something is drawn.
    if (bounds === null && sheet.centre === null) {
        return;
    }

    const layout = layoutSheet(bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }, sheet, aside);
    const { page, frame } = sheetInWorld(layout);

    ctx.save();
    ctx.strokeStyle = theme.inkSubtle;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.lineWidth = px;

    // The page edge, solid: this is where the paper ends.
    ctx.setLineDash([]);
    ctx.strokeRect(page.minX, page.minY, page.maxX - page.minX, page.maxY - page.minY);

    // The frame, dashed: inside it is the drawing, outside it the margins and the title
    // block, which is why anything crossing this line is cut off in the print.
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.strokeRect(frame.minX, frame.minY, frame.maxX - frame.minX, frame.maxY - frame.minY);

    // Solid where the drawing gives way to something the sheet prints rather than to a
    // margin: the title block along the bottom, and the strip of notes down the side.
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(frame.minX, frame.maxY);
    ctx.lineTo(frame.maxX, frame.maxY);

    if (layout.aside !== null) {
        ctx.moveTo(frame.maxX, frame.minY);
        ctx.lineTo(frame.maxX, frame.maxY);
    }

    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = `${LABEL_PX * px}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.inkSubtle;
    ctx.fillText(
        `${sheet.name}   ${sheet.size} ${sheet.orientation}   1:${layout.scale}`,
        page.minX,
        page.minY - LABEL_GAP_PX * px,
    );
    ctx.restore();
}
