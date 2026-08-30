import { boundsHeight, boundsWidth, expandBounds, type Bounds } from '@/editor/geometry/bbox';
import { paintScene } from '@/editor/render/canvasScene';
import type { SceneLayer } from '@/editor/scene/types';

/**
 * PNG export.
 *
 * The same scene the screen draws, painted onto an off-screen canvas at whatever size was
 * asked for. Nothing about the drawing is re-implemented — only the zoom changes, and pen
 * weights follow it so a large export gets crisper lines rather than thicker ones.
 */

export interface PngOptions {
    bounds: Bounds;
    /** Pixels along the drawing's longer edge. */
    longestEdgePx: number;
    background?: string;
    /** Margin around the drawing, as a fraction of its longer edge. */
    margin?: number;
}

export const PNG_SIZES = [
    { label: 'Standard', px: 1500 },
    { label: 'Large', px: 3000 },
    { label: 'Very large', px: 6000 },
] as const;

export async function sceneToPng(
    layers: readonly SceneLayer[],
    options: PngOptions,
): Promise<Blob> {
    const worldWidth = Math.max(boundsWidth(options.bounds), 1);
    const worldHeight = Math.max(boundsHeight(options.bounds), 1);
    const margin = (options.margin ?? 0.04) * Math.max(worldWidth, worldHeight);

    const box = expandBounds(options.bounds, margin);
    const boxWidth = boundsWidth(box);
    const boxHeight = boundsHeight(box);

    const zoom = options.longestEdgePx / Math.max(boxWidth, boxHeight);

    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(boxWidth * zoom));
    canvas.height = Math.max(1, Math.round(boxHeight * zoom));

    const ctx = canvas.getContext('2d');

    if (ctx === null) {
        throw new Error('This browser could not provide a canvas to export with.');
    }

    if (options.background !== undefined) {
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.setTransform(zoom, 0, 0, zoom, -box.minX * zoom, -box.minY * zoom);
    paintScene(ctx, layers, { px: 1 / zoom });

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob === null) {
                reject(new Error('The image could not be encoded.'));

                return;
            }

            resolve(blob);
        }, 'image/png');
    });
}
