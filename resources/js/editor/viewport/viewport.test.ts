import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';

import {
    fitBounds,
    MAX_ZOOM,
    MIN_ZOOM,
    panByScreen,
    screenToWorldDistance,
    toScreen,
    toWorld,
    visibleBounds,
    zoomAt,
    type Viewport,
} from './viewport';

const size = { width: 1000, height: 600 };
const viewport: Viewport = { x: 0, y: 0, zoom: 0.1 };

describe('coordinate conversion', () => {
    it('round-trips between world and screen', () => {
        const world = point(3420, -1250);
        const back = toWorld(viewport, toScreen(viewport, world));

        expect(back.x).toBeCloseTo(world.x);
        expect(back.y).toBeCloseTo(world.y);
    });

    it('converts a screen tolerance into world millimetres at the current zoom', () => {
        expect(screenToWorldDistance({ ...viewport, zoom: 0.1 }, 6)).toBeCloseTo(60);
        expect(screenToWorldDistance({ ...viewport, zoom: 1 }, 6)).toBeCloseTo(6);
    });
});

describe('zooming', () => {
    it('keeps the anchor point under the pointer', () => {
        const anchor = point(250, 400);
        const before = toWorld(viewport, anchor);
        const after = toWorld(zoomAt(viewport, anchor, 2.5), anchor);

        expect(after.x).toBeCloseTo(before.x);
        expect(after.y).toBeCloseTo(before.y);
    });

    it('clamps at both ends and stops changing there', () => {
        const zoomedOut = zoomAt(viewport, point(0, 0), 0.000001);
        expect(zoomedOut.zoom).toBe(MIN_ZOOM);

        const zoomedIn = zoomAt(viewport, point(0, 0), 1_000_000);
        expect(zoomedIn.zoom).toBe(MAX_ZOOM);

        // At the limit the viewport is returned unchanged rather than drifting.
        expect(zoomAt(zoomedIn, point(10, 10), 2)).toBe(zoomedIn);
    });
});

describe('panning', () => {
    it('moves the drawing with the pointer', () => {
        const panned = panByScreen(viewport, point(100, 0));

        // Dragging right moves the view left, so the world point under the cursor follows it.
        expect(panned.x).toBeCloseTo(viewport.x - 100 / viewport.zoom);
    });
});

describe('fitting', () => {
    it('frames a drawing with room to spare', () => {
        const bounds = { minX: 0, minY: 0, maxX: 6000, maxY: 4000 };
        const fitted = fitBounds(bounds, size, { padding: 50 });

        const topLeft = toScreen(fitted, point(bounds.minX, bounds.minY));
        const bottomRight = toScreen(fitted, point(bounds.maxX, bounds.maxY));

        expect(topLeft.x).toBeGreaterThanOrEqual(49);
        expect(topLeft.y).toBeGreaterThanOrEqual(49);
        expect(bottomRight.x).toBeLessThanOrEqual(size.width - 49);
        expect(bottomRight.y).toBeLessThanOrEqual(size.height - 49);
    });

    it('centres a degenerate box instead of zooming to infinity', () => {
        const fitted = fitBounds({ minX: 100, minY: 100, maxX: 100, maxY: 100 }, size, {
            currentZoom: 0.25,
        });

        expect(fitted.zoom).toBe(0.25);

        const centre = toScreen(fitted, point(100, 100));
        expect(centre.x).toBeCloseTo(size.width / 2);
        expect(centre.y).toBeCloseTo(size.height / 2);
    });
});

describe('visible bounds', () => {
    it('reports the world rectangle on screen', () => {
        const bounds = visibleBounds(viewport, size);

        expect(bounds.minX).toBeCloseTo(0);
        expect(bounds.maxX).toBeCloseTo(size.width / viewport.zoom);
        expect(bounds.maxY).toBeCloseTo(size.height / viewport.zoom);
    });
});
