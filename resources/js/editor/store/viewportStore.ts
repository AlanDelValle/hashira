import { create } from 'zustand';

import type { Bounds } from '@/editor/geometry/bbox';
import {
    DEFAULT_ZOOM,
    fitBounds,
    type CanvasSize,
    type Viewport,
} from '@/editor/viewport/viewport';

/**
 * Where the drawing is being looked at from.
 *
 * This changes on every wheel notch and every frame of a pan, which is why nothing in React
 * subscribes to the whole viewport — the renderer reads it imperatively, and the status bar
 * subscribes only to `zoom`, which a pan does not touch.
 */
interface ViewportStore {
    viewport: Viewport;
    size: CanvasSize;

    setViewport: (viewport: Viewport) => void;
    setSize: (size: CanvasSize) => void;
    fit: (bounds: Bounds, padding?: number) => void;
}

export const useViewportStore = create<ViewportStore>((set, get) => ({
    viewport: { x: 0, y: 0, zoom: DEFAULT_ZOOM },
    size: { width: 0, height: 0 },

    setViewport: (viewport) => set({ viewport }),

    setSize: (size) =>
        set((state) =>
            state.size.width === size.width && state.size.height === size.height ? state : { size },
        ),

    fit: (bounds, padding) => {
        const { size, viewport } = get();

        if (size.width === 0 || size.height === 0) {
            return;
        }

        set({
            viewport: fitBounds(bounds, size, {
                ...(padding === undefined ? {} : { padding }),
                currentZoom: viewport.zoom,
            }),
        });
    },
}));
