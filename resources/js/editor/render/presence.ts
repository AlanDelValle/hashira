import type { RemoteCursor } from '@/editor/presence/presence';

import type { CanvasTheme } from './theme';

/**
 * Somebody else's pointer, on your drawing.
 *
 * Chrome, not ink — like a comment pin and for the same reasons: one size on screen whatever
 * the zoom, painted over everything, absent from the scene the exporters read and from any
 * printed sheet. Nobody's cursor has ever belonged on a sheet that goes to site.
 *
 * **The name is always beside it.** Five colours cycled by account id is how you tell two
 * people apart at a glance, but colour alone names nobody — to somebody who cannot separate
 * two of these hues, five cursors would be five identical arrows. So the label is not a
 * hover-reveal or an option: it is part of the cursor.
 */

/** The arrow, in screen pixels: tall enough to read as a pointer, small enough to point. */
const ARROW_HEIGHT_PX = 15;
const ARROW_WIDTH_PX = 10;

const LABEL_PX = 10.5;
const LABEL_PADDING_X_PX = 5;
const LABEL_HEIGHT_PX = 15;

/** How far the label sits from the arrow's tip, along both axes. */
const LABEL_OFFSET_PX = 13;

export interface CursorPaintContext {
    ctx: CanvasRenderingContext2D;
    theme: CanvasTheme;
    /** One screen pixel in world millimetres. */
    px: number;
}

/**
 * Which of the five a person gets. By account id, so somebody is the same colour every time
 * you work with them, and the same colour to everybody else in the room.
 */
export function cursorColour(theme: CanvasTheme, userId: number): string {
    const palette = [
        theme.presence1,
        theme.presence2,
        theme.presence3,
        theme.presence4,
        theme.presence5,
    ];

    return palette[Math.abs(userId) % palette.length] ?? theme.presence1;
}

export function paintCursors(context: CursorPaintContext, cursors: Iterable<RemoteCursor>): void {
    for (const cursor of cursors) {
        paintCursor(context, cursor);
    }
}

function paintCursor(context: CursorPaintContext, cursor: RemoteCursor): void {
    const { ctx, theme, px } = context;
    const colour = cursorColour(theme, cursor.userId);
    const { x, y } = cursor.at;

    ctx.save();

    /*
     * The arrow, with its tip exactly on the point being reported. A cursor whose tip is not
     * where the person is pointing is worse than no cursor: it is a confident wrong answer.
     *
     * Three points and no notch. A notched pointer is the shape a mouse cursor has at 24
     * pixels; at the size this is actually drawn the notch closes up and the whole thing reads
     * as a sliver of lint on the sheet.
     */
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + ARROW_HEIGHT_PX * px);
    ctx.lineTo(x + ARROW_WIDTH_PX * px, y + ARROW_HEIGHT_PX * 0.68 * px);
    ctx.closePath();

    ctx.fillStyle = colour;
    ctx.fill();

    // A hairline of sheet around it, so a cursor over dark poché is still a cursor.
    ctx.strokeStyle = theme.sheet;
    ctx.lineWidth = 1 * px;
    ctx.stroke();

    ctx.font = `${LABEL_PX * px}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const width = ctx.measureText(cursor.name).width + LABEL_PADDING_X_PX * 2 * px;
    const left = x + LABEL_OFFSET_PX * px;
    const top = y + LABEL_OFFSET_PX * px;

    ctx.beginPath();
    ctx.roundRect(left, top, width, LABEL_HEIGHT_PX * px, 2 * px);
    ctx.fillStyle = colour;
    ctx.fill();

    // White on the person's colour: the pair the contrast audit holds to 4.5:1, because this
    // is the half that is actually text.
    ctx.fillStyle = theme.sheet;
    ctx.fillText(cursor.name, left + LABEL_PADDING_X_PX * px, top + (LABEL_HEIGHT_PX / 2) * px);

    ctx.restore();
}
