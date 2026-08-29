import { boundsHeight, boundsWidth, type Bounds } from '@/editor/geometry/bbox';
import { clamp, type Point } from '@/editor/geometry/vec';

/**
 * The window onto the drawing.
 *
 * `x` and `y` are the world coordinates showing at the canvas's top-left pixel, and `zoom` is
 * screen pixels per millimetre. Every conversion between the two spaces goes through here;
 * arithmetic on coordinates anywhere else is a bug.
 */
export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface CanvasSize {
    width: number;
    height: number;
}

/** Far enough out to see a city block, close enough in to place a 1 mm detail. */
export const MIN_ZOOM = 0.002;
export const MAX_ZOOM = 8;

/** A comfortable opening view: a 6 m room fills roughly half a laptop screen. */
export const DEFAULT_ZOOM = 0.08;

export function toScreen(viewport: Viewport, world: Point): Point {
    return {
        x: (world.x - viewport.x) * viewport.zoom,
        y: (world.y - viewport.y) * viewport.zoom,
    };
}

export function toWorld(viewport: Viewport, screen: Point): Point {
    return {
        x: screen.x / viewport.zoom + viewport.x,
        y: screen.y / viewport.zoom + viewport.y,
    };
}

/** A screen-pixel tolerance expressed in world millimetres at the current zoom. */
export function screenToWorldDistance(viewport: Viewport, pixels: number): number {
    return pixels / viewport.zoom;
}

export function worldToScreenDistance(viewport: Viewport, millimetres: number): number {
    return millimetres * viewport.zoom;
}

/**
 * Zoom by `factor`, keeping whatever is under `anchor` exactly where it is. That fixed point
 * is the whole trick to a zoom that feels attached to the pointer rather than to the window.
 */
export function zoomAt(viewport: Viewport, anchor: Point, factor: number): Viewport {
    const zoom = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);

    if (zoom === viewport.zoom) {
        return viewport;
    }

    const world = toWorld(viewport, anchor);

    return {
        zoom,
        x: world.x - anchor.x / zoom,
        y: world.y - anchor.y / zoom,
    };
}

/** Pan by a delta measured in screen pixels. */
export function panByScreen(viewport: Viewport, delta: Point): Viewport {
    return {
        ...viewport,
        x: viewport.x - delta.x / viewport.zoom,
        y: viewport.y - delta.y / viewport.zoom,
    };
}

export function centreOn(viewport: Viewport, world: Point, size: CanvasSize): Viewport {
    return {
        ...viewport,
        x: world.x - size.width / 2 / viewport.zoom,
        y: world.y - size.height / 2 / viewport.zoom,
    };
}

/**
 * Frame `bounds` in the canvas with a margin. A degenerate box — a single point, or an empty
 * drawing — keeps the current zoom and simply centres, rather than zooming to infinity.
 */
export function fitBounds(
    bounds: Bounds,
    size: CanvasSize,
    options: { padding?: number; currentZoom?: number } = {},
): Viewport {
    const padding = options.padding ?? 48;
    const available = {
        width: Math.max(size.width - padding * 2, 1),
        height: Math.max(size.height - padding * 2, 1),
    };

    const width = boundsWidth(bounds);
    const height = boundsHeight(bounds);

    const zoom =
        width <= 0 || height <= 0
            ? clamp(options.currentZoom ?? DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM)
            : clamp(
                  Math.min(available.width / width, available.height / height),
                  MIN_ZOOM,
                  MAX_ZOOM,
              );

    const centre = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
    };

    return centreOn({ x: 0, y: 0, zoom }, centre, size);
}

/** The world rectangle currently visible, used to skip painting what is off-screen. */
export function visibleBounds(viewport: Viewport, size: CanvasSize): Bounds {
    const topLeft = toWorld(viewport, { x: 0, y: 0 });
    const bottomRight = toWorld(viewport, { x: size.width, y: size.height });

    return {
        minX: topLeft.x,
        minY: topLeft.y,
        maxX: bottomRight.x,
        maxY: bottomRight.y,
    };
}
