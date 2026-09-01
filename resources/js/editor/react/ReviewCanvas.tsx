import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { Bounds } from '@/editor/geometry/bbox';
import { ReviewSurface, type ReviewContent } from '@/editor/render/review';

export interface ReviewCanvasHandle {
    /** Frame a box of world millimetres — one change picked out of the list beside it. */
    frame: (bounds: Bounds | null) => void;
    frameAll: () => void;
}

/**
 * The canvas a version is looked at on.
 *
 * The same bargain `CanvasHost` makes: React starts the surface and stops it, and everything
 * in between — the pan, the zoom, the repaint — happens without React hearing about it. What
 * is different is that this one is told what to paint rather than reading it from a store, so
 * looking at an old version cannot disturb the drawing that is open.
 *
 * To a screen reader it is a picture, because that is what it is. The list of changes beside
 * it is where the same information is available as words, and it is the thing that takes the
 * keyboard.
 */
export const ReviewCanvas = forwardRef<
    ReviewCanvasHandle,
    { content: ReviewContent | null; label: string }
>(function ReviewCanvas({ content, label }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const surfaceRef = useRef<ReviewSurface | null>(null);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const canvas = canvasRef.current;

        if (wrapper === null || canvas === null) {
            return;
        }

        const surface = new ReviewSurface(canvas);

        surfaceRef.current = surface;
        surface.start();

        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;

            if (rect !== undefined) {
                surface.resize(rect.width, rect.height);
            }
        });

        observer.observe(wrapper);

        return () => {
            observer.disconnect();
            surface.stop();
            surfaceRef.current = null;
        };
    }, []);

    useEffect(() => {
        surfaceRef.current?.show(content);
    }, [content]);

    useImperativeHandle(ref, () => ({
        frame: (bounds) => surfaceRef.current?.frame(bounds),
        frameAll: () => surfaceRef.current?.frameAll(),
    }));

    return (
        <div
            ref={wrapperRef}
            className="border-line bg-sheet relative h-full w-full overflow-hidden rounded-md border"
        >
            <canvas ref={canvasRef} role="img" aria-label={label} className="block touch-none" />
        </div>
    );
});
