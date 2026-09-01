import { useEffect, useRef } from 'react';

import { documentBounds } from '@/editor/model/elements';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { centreOn, DEFAULT_ZOOM } from '@/editor/viewport/viewport';

/**
 * Putting a drawing on screen for the first time.
 *
 * Every page that opens a drawing has the same small problem to solve, and it is fiddlier than
 * it looks: frame it once when it arrives, never again — re-framing on every change would
 * fight the person using it — and cope with a canvas that has been mounted but not yet given a
 * size, which reports a width and no height for a frame or two.
 *
 * It lived twice, comment for comment, in the editor and in the share viewer.
 */
export function useFrameOnce(drawingId: string, ready = true): void {
    const size = useViewportStore((state) => state.size);
    const framed = useRef<string | null>(null);

    useEffect(() => {
        if (!ready || size.width === 0 || size.height === 0 || framed.current === drawingId) {
            return;
        }

        const viewport = useViewportStore.getState();
        const bounds = documentBounds(useDocumentStore.getState().document);

        if (bounds === null) {
            viewport.setViewport(
                centreOn({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { x: 0, y: 0 }, size),
            );
            framed.current = drawingId;

            return;
        }

        // Recorded only when the framing actually happened, so a canvas that was still
        // mid-layout gets another go rather than being written off as done.
        if (viewport.fit(bounds)) {
            framed.current = drawingId;
        }
    }, [ready, drawingId, size]);
}

/** Frame the whole drawing — what the button and Shift 1 both mean. */
export function zoomToDrawing(): void {
    const bounds = documentBounds(useDocumentStore.getState().document);

    if (bounds !== null) {
        useViewportStore.getState().fit(bounds);
    }
}
