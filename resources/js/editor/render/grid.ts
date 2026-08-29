import type { Bounds } from '@/editor/geometry/bbox';
import type { GridSettings } from '@/editor/model/types';
import type { Viewport } from '@/editor/viewport/viewport';

import type { CanvasTheme } from './theme';

/** Below this many pixels apart, a grid stops reading as a grid and starts reading as fog. */
const MIN_SPACING_PX = 9;

/** Steps a drafter recognises. The sequence repeats by decade. */
const STEP_FACTORS = [1, 2, 5];

/** Major lines every this many minor ones, so counting squares stays easy. */
const MAJOR_EVERY = 5;

/**
 * Choose the spacing actually drawn.
 *
 * The document's grid size is what snapping uses; the drawn grid is the first multiple of it
 * that is still legible at this zoom. Zoom out far enough and 100 mm becomes 200, then 500,
 * then a metre — the lines thin out instead of turning into a grey wash.
 */
export function chooseGridStep(
    baseMm: number,
    zoom: number,
    minSpacingPx = MIN_SPACING_PX,
): number {
    if (baseMm <= 0 || zoom <= 0) {
        return baseMm;
    }

    let step = baseMm;
    let guard = 0;

    while (step * zoom < minSpacingPx && guard < 64) {
        const decade = Math.pow(10, Math.floor(Math.log10(step / baseMm) + 1e-9));
        const current = step / baseMm / decade;
        const next = STEP_FACTORS.find((factor) => factor > current + 1e-9);

        step = baseMm * decade * (next ?? STEP_FACTORS[0]! * 10);
        guard += 1;
    }

    return step;
}

export function paintGrid(
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    visible: Bounds,
    settings: GridSettings,
    theme: CanvasTheme,
): void {
    const step = chooseGridStep(settings.size, viewport.zoom);

    if (step <= 0) {
        return;
    }

    const major = step * MAJOR_EVERY;

    paintLines(ctx, visible, step, theme.gridMinor, 1 / viewport.zoom);
    paintLines(ctx, visible, major, theme.gridMajor, 1 / viewport.zoom);
    paintOrigin(ctx, visible, theme, 1 / viewport.zoom);
}

function paintLines(
    ctx: CanvasRenderingContext2D,
    visible: Bounds,
    step: number,
    color: string,
    lineWidth: number,
): void {
    const firstX = Math.ceil(visible.minX / step) * step;
    const firstY = Math.ceil(visible.minY / step) * step;

    ctx.beginPath();

    for (let x = firstX; x <= visible.maxX; x += step) {
        ctx.moveTo(x, visible.minY);
        ctx.lineTo(x, visible.maxY);
    }

    for (let y = firstY; y <= visible.maxY; y += step) {
        ctx.moveTo(visible.minX, y);
        ctx.lineTo(visible.maxX, y);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

/** The drawing origin, marked so that absolute coordinates have something to refer to. */
function paintOrigin(
    ctx: CanvasRenderingContext2D,
    visible: Bounds,
    theme: CanvasTheme,
    lineWidth: number,
): void {
    const crossesX = visible.minX <= 0 && visible.maxX >= 0;
    const crossesY = visible.minY <= 0 && visible.maxY >= 0;

    if (!crossesX && !crossesY) {
        return;
    }

    ctx.beginPath();

    if (crossesX) {
        ctx.moveTo(0, visible.minY);
        ctx.lineTo(0, visible.maxY);
    }

    if (crossesY) {
        ctx.moveTo(visible.minX, 0);
        ctx.lineTo(visible.maxX, 0);
    }

    ctx.strokeStyle = theme.inkSubtle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}
