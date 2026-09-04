import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import type { CommentPin } from '@/editor/render/comments';
import { ReviewSurface, type ReviewContent, type ReviewPick } from '@/editor/render/review';

export interface ReviewCanvasHandle {
    /** Frame a box of world millimetres — one change picked out of the list beside it. */
    frame: (bounds: Bounds | null) => void;
    frameAll: () => void;
    /** Bring a world point to the middle, for a thread chosen from a list. */
    centre: (world: Point) => void;
    /** Where a world point is on the canvas now, for anything floating over it. */
    toScreen: (world: Point) => Point;
    /** One screen pixel in world millimetres, which is what pin geometry is measured in. */
    pixel: () => number;
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
    {
        content: ReviewContent | null;
        label: string;
        /** Comment pins to paint over it. Absent, the surface is only for looking. */
        pins?: readonly CommentPin[];
        selectedPinId?: string | null;
        /** Called when a click turns out to be a pin, or an empty place. */
        onPick?: (pick: ReviewPick) => void;
        /** Called whenever the view moves, so a floating composer can follow it. */
        onViewChange?: () => void;
    }
>(function ReviewCanvas({ content, label, pins, selectedPinId, onPick, onViewChange }, ref) {
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

    useEffect(() => {
        surfaceRef.current?.showComments(pins ?? [], selectedPinId ?? null);
    }, [pins, selectedPinId]);

    /*
     * Assigned rather than passed to the constructor: the surface is started once, and these
     * are closures over props that change on every render. Handing it the latest one each time
     * keeps it from calling back into a stale one.
     */
    useEffect(() => {
        const surface = surfaceRef.current;

        if (surface !== null) {
            surface.onPick = onPick ?? null;
            surface.onViewChange = onViewChange ?? null;
        }
    });

    useImperativeHandle(ref, () => ({
        frame: (bounds) => surfaceRef.current?.frame(bounds),
        frameAll: () => surfaceRef.current?.frameAll(),
        centre: (world) => surfaceRef.current?.centre(world),
        toScreen: (world) => surfaceRef.current?.toScreen(world) ?? { x: 0, y: 0 },
        pixel: () => surfaceRef.current?.pixel ?? 1,
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
