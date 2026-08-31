import { TAU } from '@/editor/geometry/angle';
import type { SceneLayer, ScenePrimitive, Stroke } from '@/editor/scene/types';

/**
 * Drawing a scene onto a canvas.
 *
 * The canvas has already been transformed into world space, so everything here is in
 * millimetres. The one conversion that matters is line weight: a plotted pen is a width on the
 * finished sheet, and on screen that has to become a constant number of pixels however far in
 * or out the drawing is zoomed.
 */

/** Pixels per millimetre of sheet, at a nominal 96 dpi. */
const SCREEN_PX_PER_SHEET_MM = 96 / 25.4;

/** Below one pixel a line stops reading as a line and starts reading as a smudge. */
const MINIMUM_PEN_PX = 1;

export interface CanvasSceneOptions {
    /** One screen pixel expressed in world millimetres — the reciprocal of the zoom. */
    px: number;
}

export function paintScene(
    ctx: CanvasRenderingContext2D,
    layers: readonly SceneLayer[],
    options: CanvasSceneOptions,
): void {
    for (const layer of layers) {
        for (const primitive of layer.primitives) {
            paintPrimitive(ctx, primitive, options);
        }
    }
}

export function paintPrimitive(
    ctx: CanvasRenderingContext2D,
    primitive: ScenePrimitive,
    options: CanvasSceneOptions,
): void {
    ctx.save();

    switch (primitive.kind) {
        case 'polyline': {
            const [first, ...rest] = primitive.points;

            if (first === undefined) break;

            ctx.beginPath();
            ctx.moveTo(first.x, first.y);

            for (const p of rest) {
                ctx.lineTo(p.x, p.y);
            }

            if (primitive.closed) ctx.closePath();

            fillThenStroke(ctx, primitive.fill ?? null, primitive.stroke, options);
            break;
        }

        case 'area': {
            ctx.beginPath();

            for (const ring of primitive.rings) {
                const [first, ...rest] = ring;

                if (first === undefined) continue;

                ctx.moveTo(first.x, first.y);

                for (const p of rest) {
                    ctx.lineTo(p.x, p.y);
                }

                ctx.closePath();
            }

            fillThenStroke(ctx, primitive.fill, primitive.stroke, options);
            break;
        }

        case 'circle':
            ctx.beginPath();
            ctx.arc(primitive.centre.x, primitive.centre.y, primitive.radius, 0, TAU);
            fillThenStroke(ctx, primitive.fill ?? null, primitive.stroke, options);
            break;

        case 'ellipse':
            ctx.beginPath();
            ctx.ellipse(
                primitive.centre.x,
                primitive.centre.y,
                primitive.rx,
                primitive.ry,
                primitive.rotation,
                0,
                TAU,
            );
            fillThenStroke(ctx, primitive.fill ?? null, primitive.stroke, options);
            break;

        case 'arc':
            ctx.beginPath();
            ctx.arc(
                primitive.centre.x,
                primitive.centre.y,
                primitive.radius,
                primitive.from,
                primitive.to,
                primitive.anticlockwise,
            );
            fillThenStroke(ctx, null, primitive.stroke, options);
            break;

        case 'text':
            ctx.translate(primitive.at.x, primitive.at.y);
            ctx.rotate(primitive.rotation);
            ctx.font = `${primitive.size}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign =
                primitive.align === 'center'
                    ? 'center'
                    : primitive.align === 'right'
                      ? 'right'
                      : 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = primitive.fill;
            ctx.fillText(primitive.content, 0, 0);
            break;
    }

    ctx.restore();
}

function fillThenStroke(
    ctx: CanvasRenderingContext2D,
    fill: string | null,
    stroke: Stroke | null,
    options: CanvasSceneOptions,
): void {
    if (fill !== null) {
        ctx.fillStyle = fill;
        ctx.fill();
    }

    if (stroke === null) {
        return;
    }

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = strokeWidthInWorld(stroke, options.px);
    ctx.lineCap = stroke.cap ?? 'round';
    ctx.lineJoin = 'round';
    const dash = stroke.dash ?? null;

    ctx.setLineDash(dash === null ? [] : dash.map((mm) => sheetToWorld(mm, options.px)));
    ctx.stroke();
}

/**
 * A pen weight is converted to a fixed number of screen pixels and then back into world
 * units, so it never grows or shrinks with the zoom.
 */
export function strokeWidthInWorld(stroke: Stroke, px: number): number {
    return Math.max(stroke.width * SCREEN_PX_PER_SHEET_MM, MINIMUM_PEN_PX) * px;
}

function sheetToWorld(sheetMm: number, px: number): number {
    return sheetMm * SCREEN_PX_PER_SHEET_MM * px;
}
