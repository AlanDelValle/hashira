import { TAU } from '@/editor/geometry/angle';
import { boundsCorners, unionBounds, type Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import { elementBounds, type ElementLookup } from '@/editor/model/elements';
import type { DisplayUnit, Element, Layer } from '@/editor/model/types';
import type { WallJoins } from '@/editor/model/walls';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';
import type { Marquee } from '@/editor/store/interaction';
import type { SnapResult } from '@/editor/snapping/engine';

import { paintScene } from './canvasScene';
import type { CanvasTheme } from './theme';

/**
 * Everything drawn on top of the drawing: what is hovered, what is selected, the rubber band,
 * the shape being drawn, and why the pointer moved.
 *
 * All of it comes from interaction state rather than the document, which is why it can change
 * at pointer rate without anything else in the application noticing.
 */

/** A colour that paints nothing, for an area whose fill the drawing underneath already has. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Distance from the selection box to the rotation handle, in screen pixels. */
const ROTATE_HANDLE_OFFSET_PX = 26;
const ROTATE_HANDLE_RADIUS_PX = 4.5;

export interface OverlayContext {
    ctx: CanvasRenderingContext2D;
    theme: CanvasTheme;
    palette: ScenePalette;
    layers: readonly Layer[];
    lookup: ElementLookup;
    /**
     * Where the walls meet, for this frame. A wall is mitred against its neighbours, so
     * highlighting one on its own has to be told what it meets — otherwise the accent band is
     * square where the drawing underneath it is not.
     */
    joins: WallJoins;
    /** The document's display unit, which a selected dimension still has to write its value in. */
    unit: DisplayUnit;
    /** One screen pixel in world millimetres. */
    px: number;
}

export function selectionBounds(
    elements: readonly Element[],
    context: { lookup: ElementLookup },
): Bounds | null {
    let result: Bounds | null = null;

    for (const element of elements) {
        result = unionBounds(result, elementBounds(element, context.lookup));
    }

    return result;
}

interface AccentOptions {
    alpha?: number;
    /**
     * Whether a room's wash is painted.
     *
     * A highlight goes on top of the finished drawing, so filling a room again would bury the
     * furniture standing in it — what is selected there is the space, and its outline says so
     * without hiding anything. A room being *drawn* is not in the drawing yet and does want
     * its wash: that is what makes it read as a space rather than as four lines.
     */
    wash?: boolean;
}

/** Draw elements in the accent colour, through the same builder the document uses. */
function paintAccented(
    context: OverlayContext,
    elements: readonly Element[],
    { alpha = 1, wash = false }: AccentOptions = {},
): void {
    if (elements.length === 0) {
        return;
    }

    context.ctx.save();
    context.ctx.globalAlpha = alpha;

    paintScene(
        context.ctx,
        buildScene(elements, context.layers, {
            palette: wash ? context.palette : { ...context.palette, roomFill: TRANSPARENT },
            unit: context.unit,
            joins: context.joins,
            overrideColor: context.theme.accent,
            // What is selected is drawn whatever its layer says, because the selection is a
            // fact about this moment rather than about the drawing.
            includeHidden: true,
        }),
        { px: context.px },
    );

    context.ctx.restore();
}

export function paintHover(context: OverlayContext, element: Element): void {
    paintAccented(context, [element], { alpha: 0.5 });
}

export function paintSelection(context: OverlayContext, elements: readonly Element[]): void {
    paintAccented(context, elements);

    const bounds = selectionBounds(elements, context);

    if (bounds === null) {
        return;
    }

    const { ctx, px } = context;

    ctx.save();
    ctx.strokeStyle = context.theme.accent;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    ctx.restore();

    paintRotateHandle(context, rotateHandlePosition(bounds, px));
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

function paintRotateHandle(context: OverlayContext, at: Point): void {
    const { ctx, px } = context;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x, at.y + ROTATE_HANDLE_OFFSET_PX * px);
    ctx.strokeStyle = context.theme.accent;
    ctx.lineWidth = px;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(at.x, at.y, rotateHandleRadius(px), 0, TAU);
    ctx.fillStyle = context.theme.sheet;
    ctx.fill();
    ctx.strokeStyle = context.theme.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
    ctx.restore();
}

/**
 * The rubber band. Solid means "only what is completely inside"; dashed means "anything I
 * touch" — the convention drafting tools have used for decades, so the shape of the band
 * tells you what it will catch.
 */
export function paintMarquee(context: OverlayContext, marquee: Marquee): void {
    const { ctx, px } = context;
    const x = Math.min(marquee.from.x, marquee.to.x);
    const y = Math.min(marquee.from.y, marquee.to.y);
    const width = Math.abs(marquee.to.x - marquee.from.x);
    const height = Math.abs(marquee.to.y - marquee.from.y);

    ctx.save();
    ctx.fillStyle = context.theme.accentSoft;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = context.theme.accent;
    ctx.lineWidth = px;
    ctx.setLineDash(marquee.mode === 'crossing' ? [4 * px, 3 * px] : []);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

export function paintPreview(
    context: OverlayContext,
    element: Element,
    vertices: readonly Point[],
): void {
    // A room is the one preview that is an area rather than an outline, and an opaque one
    // covers the furniture standing in the space it is offering to fill. Drawn through, it
    // says what will be created without hiding what is already there.
    paintAccented(context, [element], { alpha: element.type === 'room' ? 0.55 : 1, wash: true });

    const { ctx, px } = context;

    ctx.save();
    ctx.fillStyle = context.theme.accent;

    for (const vertex of vertices) {
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 3 * px, 0, TAU);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Why the pointer moved.
 *
 * Each kind of snap gets its own mark, because "you landed on a corner" and "you are lined up
 * with something over there" are different pieces of information, and a drafter reads the
 * difference at a glance. Alignment also draws the guide back to what it lined up with — the
 * mark alone would say a coordinate is locked without saying to what.
 */
export function paintSnapIndicator(context: OverlayContext, snap: SnapResult): void {
    const { ctx, px } = context;
    const size = 4.5 * px;
    const { x, y } = snap.point;

    ctx.save();
    ctx.strokeStyle = context.theme.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([]);

    if (snap.reference !== undefined) {
        ctx.save();
        ctx.setLineDash([5 * px, 4 * px]);
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.moveTo(snap.reference.x, snap.reference.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
    }

    ctx.beginPath();

    switch (snap.kind) {
        case 'endpoint':
            ctx.rect(x - size, y - size, size * 2, size * 2);
            break;

        case 'midpoint':
            ctx.moveTo(x - size, y + size);
            ctx.lineTo(x + size, y + size);
            ctx.lineTo(x, y - size);
            ctx.closePath();
            break;

        case 'intersection':
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y - size);
            ctx.lineTo(x - size, y + size);
            break;

        case 'horizontal':
        case 'vertical':
            ctx.arc(x, y, size * 0.7, 0, TAU);
            break;

        case 'grid':
            // Quieter than the rest, and a different job: the others say what caught the
            // pointer, this one only says where the next click will land. It is drawn while a
            // tool is placing points, because that is when the answer matters and when a
            // marker under the cursor is not simply always on.
            ctx.globalAlpha = 0.55;
            ctx.moveTo(x - size, y);
            ctx.lineTo(x + size, y);
            ctx.moveTo(x, y - size);
            ctx.lineTo(x, y + size);
            break;

        case null:
            ctx.restore();

            return;
    }

    ctx.stroke();
    ctx.restore();
}

/** Corner ticks around the drawing extent — quiet, and only useful while zoomed out. */
export function paintExtentMarks(context: OverlayContext, bounds: Bounds): void {
    const { ctx, px } = context;
    const arm = 8 * px;

    ctx.save();
    ctx.strokeStyle = context.theme.line;
    ctx.lineWidth = px;
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
