import { TAU } from '@/editor/geometry/angle';
import { findAsset, type AssetPrimitive } from '@/editor/assets/library';
import type { AssetElement } from '@/editor/model/types';

/**
 * Drawing a library block.
 *
 * The block's primitives live in a normalised 0–1 box; they are mapped into the element's own
 * millimetres here. The canvas is only ever translated and rotated, never scaled, so a
 * hairline stays a hairline no matter how wide the sofa is — scaling the context instead would
 * stretch the pen along with the shape.
 */
export function paintAsset(
    ctx: CanvasRenderingContext2D,
    element: AssetElement,
    lineWidth: number,
    stroke: string,
): void {
    const definition = findAsset(element.geometry.assetId);

    if (definition === undefined) {
        // An unknown block still occupies space in the drawing; showing its footprint is
        // honest, and better than a silent gap where someone placed something.
        paintUnknown(ctx, element, lineWidth, stroke);

        return;
    }

    const { width, height, mirrored } = element.geometry;
    const flip = mirrored ? -1 : 1;
    const mapX = (nx: number): number => (nx - 0.5) * width * flip;
    const mapY = (ny: number): number => (ny - 0.5) * height;
    const arcRadius = Math.min(width, height);

    ctx.save();
    ctx.translate(element.transform.x, element.transform.y);
    ctx.rotate(element.transform.rotation);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (const primitive of definition.draw) {
        trace(ctx, primitive, mapX, mapY, arcRadius);
    }

    ctx.stroke();
    ctx.restore();
}

function trace(
    ctx: CanvasRenderingContext2D,
    primitive: AssetPrimitive,
    mapX: (n: number) => number,
    mapY: (n: number) => number,
    arcRadius: number,
): void {
    switch (primitive.kind) {
        case 'rect': {
            const x = mapX(primitive.x);
            const y = mapY(primitive.y);

            ctx.moveTo(x, y);
            ctx.lineTo(mapX(primitive.x + primitive.w), y);
            ctx.lineTo(mapX(primitive.x + primitive.w), mapY(primitive.y + primitive.h));
            ctx.lineTo(x, mapY(primitive.y + primitive.h));
            ctx.closePath();

            return;
        }

        case 'line':
            ctx.moveTo(mapX(primitive.x1), mapY(primitive.y1));
            ctx.lineTo(mapX(primitive.x2), mapY(primitive.y2));

            return;

        case 'ellipse': {
            // Radii are mapped independently, so a circle in the normalised box becomes the
            // ellipse the block's proportions imply — which is what a plan view wants.
            const rx = Math.abs(mapX(primitive.cx + primitive.rx) - mapX(primitive.cx));
            const ry = Math.abs(mapY(primitive.cy + primitive.ry) - mapY(primitive.cy));

            ctx.moveTo(mapX(primitive.cx) + rx, mapY(primitive.cy));
            ctx.ellipse(mapX(primitive.cx), mapY(primitive.cy), rx, ry, 0, 0, TAU);

            return;
        }

        case 'polyline': {
            const { points } = primitive;
            const firstX = points[0];
            const firstY = points[1];

            if (firstX === undefined || firstY === undefined) return;

            ctx.moveTo(mapX(firstX), mapY(firstY));

            for (let i = 2; i + 1 < points.length; i += 2) {
                const x = points[i];
                const y = points[i + 1];

                if (x !== undefined && y !== undefined) {
                    ctx.lineTo(mapX(x), mapY(y));
                }
            }

            if (primitive.closed) {
                ctx.closePath();
            }

            return;
        }

        case 'arc': {
            const radius = primitive.r * arcRadius;
            const cx = mapX(primitive.cx);
            const cy = mapY(primitive.cy);

            ctx.moveTo(
                cx + Math.cos(primitive.from) * radius,
                cy + Math.sin(primitive.from) * radius,
            );
            ctx.arc(cx, cy, radius, primitive.from, primitive.to);
        }
    }
}

function paintUnknown(
    ctx: CanvasRenderingContext2D,
    element: AssetElement,
    lineWidth: number,
    stroke: string,
): void {
    const halfWidth = element.geometry.width / 2;
    const halfHeight = element.geometry.height / 2;

    ctx.save();
    ctx.translate(element.transform.x, element.transform.y);
    ctx.rotate(element.transform.rotation);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([4 * lineWidth, 3 * lineWidth]);
    ctx.strokeRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
    ctx.restore();
}
