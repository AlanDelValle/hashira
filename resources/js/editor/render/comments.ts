import type { Point } from '@/editor/geometry/vec';

import type { CanvasTheme } from './theme';

/**
 * The pins that say somebody has remarked on a place.
 *
 * A pin is chrome, not ink. It is a constant size on screen however far the drawing is zoomed,
 * it is never part of the scene the exporters read, and it never appears on a printed sheet —
 * a plan that goes to site carries what was decided, not the conversation that decided it.
 *
 * **Open and resolved differ in shape, not only in colour.** A pin that is still open is a
 * solid head with its number reversed out of it; a resolved one is a hollow ring with the
 * number written inside. That is the rule 9.5 settled for redlines, applied to the first thing
 * built after it: nothing on this canvas may mean something in colour alone. The list beside
 * the drawing says the same thing again, in words.
 *
 * **A pin is numbered by when it was raised**, oldest first, so the number beside somebody's
 * words is still the number on the drawing tomorrow. Numbering by position in the list would
 * renumber every pin the moment one was resolved.
 *
 * Hit testing lives here too, next to the painting, so the picture and the pointer cannot
 * disagree about where a pin is.
 */

/** Radius of the head, in screen pixels. */
const RADIUS_PX = 9;

/** How far the head sits above the point it marks, so the point itself stays visible. */
const LIFT_PX = 11;

/** The ring drawn round the pin whose thread is open in the panel. */
const SELECTED_RING_PX = 3.5;

const LABEL_PX = 10.5;

export interface CommentPin {
    id: string;
    /** Where it points, in world millimetres. */
    at: Point;
    resolved: boolean;
    /** What it is called on the drawing and in the list. 1 is the oldest. */
    number: number;
}

export interface CommentPinContext {
    ctx: CanvasRenderingContext2D;
    theme: CanvasTheme;
    /** One screen pixel in world millimetres. */
    px: number;
}

/**
 * Where a pin's head sits, given the point it marks.
 *
 * Lifted off the anchor rather than centred on it, so the geometry being talked about is not
 * hidden by the thing talking about it — and the tip of the tail is exactly the point that was
 * clicked, which is what makes the pin readable as pointing at something.
 */
export function pinHead(at: Point, px: number): Point {
    return { x: at.x, y: at.y - (LIFT_PX + RADIUS_PX) * px };
}

/** Whether a world point is within a pin's head. Used for picking, in the same geometry. */
export function hitsPin(pin: CommentPin, world: Point, px: number): boolean {
    const head = pinHead(pin.at, px);
    const dx = world.x - head.x;
    const dy = world.y - head.y;

    return Math.hypot(dx, dy) <= RADIUS_PX * px;
}

/**
 * The topmost pin under a point, or null. Later pins are drawn over earlier ones, so the
 * search runs backwards and the one you can see is the one you get.
 */
export function pinAt(pins: readonly CommentPin[], world: Point, px: number): CommentPin | null {
    for (let index = pins.length - 1; index >= 0; index -= 1) {
        const pin = pins[index];

        if (pin !== undefined && hitsPin(pin, world, px)) {
            return pin;
        }
    }

    return null;
}

export function paintCommentPins(
    context: CommentPinContext,
    pins: readonly CommentPin[],
    selectedId: string | null,
): void {
    for (const pin of pins) {
        paintPin(context, pin, pin.id === selectedId);
    }
}

function paintPin(context: CommentPinContext, pin: CommentPin, selected: boolean): void {
    const { ctx, theme, px } = context;
    const head = pinHead(pin.at, px);
    const radius = RADIUS_PX * px;

    ctx.save();

    // The tail, from the head down to the point actually being remarked on.
    ctx.beginPath();
    ctx.moveTo(head.x, head.y + radius * 0.6);
    ctx.lineTo(pin.at.x, pin.at.y);
    ctx.strokeStyle = pin.resolved ? theme.inkSubtle : theme.accent;
    ctx.lineWidth = 1.25 * px;
    ctx.stroke();

    if (selected) {
        ctx.beginPath();
        ctx.arc(head.x, head.y, radius + SELECTED_RING_PX * px, 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5 * px;
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);

    if (pin.resolved) {
        // Hollow, so a settled remark reads as settled without being read as a colour.
        ctx.fillStyle = theme.sheet;
        ctx.fill();
        ctx.strokeStyle = theme.inkSubtle;
        ctx.lineWidth = 1.25 * px;
        ctx.stroke();
    } else {
        ctx.fillStyle = theme.accent;
        ctx.fill();
    }

    ctx.font = `${LABEL_PX * px}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pin.resolved ? theme.inkSubtle : theme.sheet;
    ctx.fillText(String(pin.number), head.x, head.y + 0.5 * px);

    ctx.restore();
}
