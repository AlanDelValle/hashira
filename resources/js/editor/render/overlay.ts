import { boundsCorners, unionBounds, type Bounds } from '@/editor/geometry/bbox';
import { TAU } from '@/editor/geometry/angle';
import type { Point } from '@/editor/geometry/vec';
import { elementBounds } from '@/editor/model/elements';
import type { Element } from '@/editor/model/types';
import type { Marquee } from '@/editor/store/interaction';

import { paintElement, type PaintContext } from './painters';

/**
 * Everything drawn on top of the drawing: what is hovered, what is selected, the rubber band,
 * and the shape currently being drawn.
 *
 * All of it comes from interaction state rather than the document, which is why it can change
 * at pointer rate without anything else in the application noticing.
 */

/** Distance from the selection box to the rotation handle, in screen pixels. */
const ROTATE_HANDLE_OFFSET_PX = 26;
const ROTATE_HANDLE_RADIUS_PX = 4.5;

export function selectionBounds(
    elements: readonly Element[],
    pc: Pick<PaintContext, 'lookup'>,
): Bounds | null {
    let result: Bounds | null = null;

    for (const element of elements) {
        result = unionBounds(result, elementBounds(element, pc.lookup));
    }

    return result;
}

export function paintHover(pc: PaintContext, element: Element): void {
    pc.ctx.save();
    pc.ctx.globalAlpha = 0.5;
    paintElement({ ...pc, layerColor: () => pc.theme.accent }, element);
    pc.ctx.restore();
}

export function paintSelection(pc: PaintContext, elements: readonly Element[]): void {
    if (elements.length === 0) {
        return;
    }

    for (const element of elements) {
        paintElement({ ...pc, layerColor: () => pc.theme.accent }, element);
    }

    const bounds = selectionBounds(elements, pc);

    if (bounds === null) {
        return;
    }

    const { ctx } = pc;

    ctx.save();
    ctx.strokeStyle = pc.theme.accent;
    ctx.lineWidth = pc.px;
    ctx.setLineDash([4 * pc.px, 3 * pc.px]);
    ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    ctx.restore();

    paintRotateHandle(pc, rotateHandlePosition(bounds, pc.px));
}

/** Where the rotation handle sits for a given selection, in world millimetres. */
export function rotateHandlePosition(bounds: Bounds, px: number): Point {
    return {
        x: (bounds.minX + bounds.maxX) / 2,
        y: bounds.minY - ROTATE_HANDLE_OFFSET_PX * px,
    };
}

export function rotateHandleRadius(px: number): number {
    return ROTATE_HANDLE_RADIUS_PX * px;
}

function paintRotateHandle(pc: PaintContext, at: Point): void {
    const { ctx } = pc;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x, at.y + ROTATE_HANDLE_OFFSET_PX * pc.px);
    ctx.strokeStyle = pc.theme.accent;
    ctx.lineWidth = pc.px;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(at.x, at.y, rotateHandleRadius(pc.px), 0, TAU);
    ctx.fillStyle = pc.theme.sheet;
    ctx.fill();
    ctx.strokeStyle = pc.theme.accent;
    ctx.lineWidth = 1.5 * pc.px;
    ctx.stroke();
    ctx.restore();
}

/**
 * The rubber band. Solid means "only what is completely inside"; dashed means "anything I
 * touch" — the same left-to-right and right-to-left convention drafting tools have used for
 * decades, so the shape of the band tells you what it will catch.
 */
export function paintMarquee(pc: PaintContext, marquee: Marquee): void {
    const { ctx } = pc;
    const x = Math.min(marquee.from.x, marquee.to.x);
    const y = Math.min(marquee.from.y, marquee.to.y);
    const width = Math.abs(marquee.to.x - marquee.from.x);
    const height = Math.abs(marquee.to.y - marquee.from.y);

    ctx.save();
    ctx.fillStyle = pc.theme.accentSoft;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = pc.theme.accent;
    ctx.lineWidth = pc.px;
    ctx.setLineDash(marquee.mode === 'crossing' ? [4 * pc.px, 3 * pc.px] : []);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

export function paintPreview(pc: PaintContext, element: Element, vertices: readonly Point[]): void {
    pc.ctx.save();
    paintElement({ ...pc, layerColor: () => pc.theme.accent }, element);

    for (const vertex of vertices) {
        pc.ctx.beginPath();
        pc.ctx.arc(vertex.x, vertex.y, 3 * pc.px, 0, TAU);
        pc.ctx.fillStyle = pc.theme.accent;
        pc.ctx.fill();
    }

    pc.ctx.restore();
}

/** Corner ticks around the drawing extent — quiet, and only useful while zoomed out. */
export function paintExtentMarks(pc: PaintContext, bounds: Bounds): void {
    const { ctx } = pc;
    const arm = 8 * pc.px;

    ctx.save();
    ctx.strokeStyle = pc.theme.line;
    ctx.lineWidth = pc.px;
    ctx.beginPath();

    for (const corner of boundsCorners(bounds)) {
        ctx.moveTo(corner.x - arm, corner.y);
        ctx.lineTo(corner.x + arm, corner.y);
        ctx.moveTo(corner.x, corner.y - arm);
        ctx.lineTo(corner.x, corner.y + arm);
    }

    ctx.stroke();
    ctx.restore();
}
