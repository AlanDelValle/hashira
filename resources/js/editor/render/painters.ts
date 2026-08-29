import { TAU } from '@/editor/geometry/angle';
import {
    add,
    clamp,
    distance,
    normalize,
    perpendicular,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';
import {
    doorSwing,
    elementWorldPoints,
    hostedFrame,
    type ElementLookup,
} from '@/editor/model/elements';
import type { Element, HostedElement, WallElement } from '@/editor/model/types';
import type { HostedFrame } from '@/editor/model/elements';

import type { CanvasTheme } from './theme';

/**
 * Painting the document.
 *
 * The canvas is transformed into world space before any of this runs, so every coordinate
 * here is millimetres and the painters never think about zoom. The one thing that must not
 * scale is pen weight — a 0.25 mm line stays a hairline on screen at every zoom, the way it
 * does on a plotter — so widths are given in screen pixels converted through `px`.
 */

export interface PaintContext {
    ctx: CanvasRenderingContext2D;
    theme: CanvasTheme;
    lookup: ElementLookup;
    /** Hosted openings grouped by the wall they cut. */
    openings: Map<string, HostedElement[]>;
    /** One screen pixel, in world millimetres. */
    px: number;
    layerColor: (layerId: string) => string;
}

const HAIRLINE_PX = 1.25;
const FINE_PX = 1;

export function paintElement(pc: PaintContext, element: Element): void {
    const { ctx } = pc;
    const stroke = element.style?.stroke ?? pc.layerColor(element.layerId);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = HAIRLINE_PX * pc.px;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (element.type) {
        case 'wall':
            paintWall(pc, element, stroke);
            break;
        case 'line':
            paintPolyline(pc, elementWorldPoints(element, pc.lookup), false);
            break;
        case 'rect':
            paintClosed(pc, elementWorldPoints(element, pc.lookup), element.style?.fill ?? null);
            break;
        case 'polygon':
            paintPolyline(
                pc,
                elementWorldPoints(element, pc.lookup),
                element.geometry.closed,
                element.style?.fill ?? null,
            );
            break;
        case 'room':
            paintRoom(pc, elementWorldPoints(element, pc.lookup));
            break;
        case 'circle':
            paintCircle(
                pc,
                element.transform,
                element.geometry.radius,
                element.style?.fill ?? null,
            );
            break;
        case 'text':
            paintText(pc, element, stroke);
            break;
        case 'door':
        case 'window':
            // Openings are painted with the wall they cut, so that the gap and what fills it
            // are produced by the same pass and cannot disagree.
            break;
    }

    ctx.restore();
}

/**
 * A wall is a solid band, interrupted wherever an opening sits in it.
 *
 * The band is drawn as a butt-capped stroke as wide as the wall is thick, which gives the
 * poché for free and keeps the ends square where the openings cut it.
 */
function paintWall(pc: PaintContext, wall: WallElement, stroke: string): void {
    const { ctx } = pc;
    const [a, b] = elementWorldPoints(wall, pc.lookup);

    if (a === undefined || b === undefined) {
        return;
    }

    const length = distance(a, b);

    if (length === 0) {
        return;
    }

    const direction = normalize(subtract(b, a));
    const openings = pc.openings.get(wall.id) ?? [];

    const gaps = openings
        .map((opening) => {
            const half = opening.geometry.width / 2;

            return [
                clamp(opening.geometry.offset - half, 0, length),
                clamp(opening.geometry.offset + half, 0, length),
            ] as const;
        })
        .sort((first, second) => first[0] - second[0]);

    ctx.beginPath();

    let cursor = 0;

    for (const [start, end] of gaps) {
        if (start > cursor) {
            addSpan(ctx, a, direction, cursor, start);
        }

        cursor = Math.max(cursor, end);
    }

    if (cursor < length) {
        addSpan(ctx, a, direction, cursor, length);
    }

    ctx.lineWidth = wall.geometry.thickness;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = stroke;
    ctx.stroke();

    for (const opening of openings) {
        paintOpening(pc, opening, stroke);
    }
}

function addSpan(
    ctx: CanvasRenderingContext2D,
    origin: Point,
    direction: Point,
    from: number,
    to: number,
): void {
    const start = add(origin, scale(direction, from));
    const end = add(origin, scale(direction, to));

    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
}

function paintOpening(pc: PaintContext, opening: HostedElement, stroke: string): void {
    const frame = hostedFrame(opening, pc.lookup);

    if (frame === null) {
        return;
    }

    const { ctx } = pc;
    const along = scale(frame.direction, frame.halfWidth);
    const across = scale(perpendicular(frame.direction), frame.thickness / 2);
    const start = subtract(frame.centre, along);
    const end = add(frame.centre, along);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = FINE_PX * pc.px;
    ctx.lineCap = 'butt';

    // Jambs: the square ends of the wall where the opening begins and stops.
    ctx.beginPath();
    line(ctx, subtract(start, across), add(start, across));
    line(ctx, subtract(end, across), add(end, across));
    ctx.stroke();

    if (opening.type === 'window') {
        ctx.beginPath();
        line(ctx, subtract(start, across), subtract(end, across));
        line(ctx, add(start, across), add(end, across));
        line(ctx, start, end);
        ctx.stroke();
    } else {
        paintDoorLeaf(pc, opening, frame, stroke);
    }

    ctx.restore();
}

function paintDoorLeaf(
    pc: PaintContext,
    door: Extract<Element, { type: 'door' }>,
    frame: HostedFrame,
    stroke: string,
): void {
    const { ctx } = pc;
    const swing = doorSwing(door, frame);
    const leafEnd = add(swing.hinge, scale(swing.openDirection, swing.radius));

    ctx.beginPath();
    line(ctx, swing.hinge, leafEnd);
    ctx.lineWidth = HAIRLINE_PX * pc.px;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    const from = Math.atan2(swing.openDirection.y, swing.openDirection.x);
    const to = Math.atan2(swing.towardsOtherJamb.y, swing.towardsOtherJamb.x);
    const anticlockwise = (to - from + TAU) % TAU > Math.PI;

    ctx.beginPath();
    ctx.arc(swing.hinge.x, swing.hinge.y, swing.radius, from, to, anticlockwise);
    ctx.lineWidth = FINE_PX * pc.px;
    ctx.strokeStyle = pc.theme.inkSubtle;
    ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
}

function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[], closed: boolean): void {
    const first = points[0];

    if (first === undefined) {
        return;
    }

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < points.length; i++) {
        const p = points[i];

        if (p !== undefined) {
            ctx.lineTo(p.x, p.y);
        }
    }

    if (closed) {
        ctx.closePath();
    }
}

function paintPolyline(
    pc: PaintContext,
    points: readonly Point[],
    closed: boolean,
    fill: string | null = null,
): void {
    if (points.length < 2) {
        return;
    }

    tracePath(pc.ctx, points, closed);

    if (fill !== null && closed) {
        pc.ctx.fillStyle = fill;
        pc.ctx.fill();
    }

    pc.ctx.stroke();
}

function paintClosed(pc: PaintContext, points: readonly Point[], fill: string | null): void {
    paintPolyline(pc, points, true, fill);
}

function paintRoom(pc: PaintContext, points: readonly Point[]): void {
    if (points.length < 3) {
        return;
    }

    tracePath(pc.ctx, points, true);
    pc.ctx.fillStyle = pc.theme.accentSoft;
    pc.ctx.fill();
    pc.ctx.stroke();
}

function paintCircle(
    pc: PaintContext,
    transform: { x: number; y: number },
    radius: number,
    fill: string | null,
): void {
    pc.ctx.beginPath();
    pc.ctx.arc(transform.x, transform.y, radius, 0, TAU);

    if (fill !== null) {
        pc.ctx.fillStyle = fill;
        pc.ctx.fill();
    }

    pc.ctx.stroke();
}

function paintText(
    pc: PaintContext,
    element: Extract<Element, { type: 'text' }>,
    color: string,
): void {
    const { ctx } = pc;
    const { content, fontSize, align } = element.geometry;

    ctx.save();
    ctx.translate(element.transform.x, element.transform.y);
    ctx.rotate(element.transform.rotation);
    ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(content, 0, 0);
    ctx.restore();
}
