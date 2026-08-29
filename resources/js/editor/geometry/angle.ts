export const TAU = Math.PI * 2;

/** Wrap into (-π, π]. */
export function normalizeAngle(radians: number): number {
    const wrapped = ((((radians + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

    // -π and π are the same direction; prefer the positive representative so that formatting
    // a half turn reads as 180° rather than -180°.
    return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Wrap into [0, 2π). */
export function normalizeAnglePositive(radians: number): number {
    return ((radians % TAU) + TAU) % TAU;
}

export function toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
}

export function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * Snap to the nearest multiple of `step` radians — what Shift does while drawing, so a line
 * can be held to 15° increments without the pointer having to be exact.
 */
export function snapAngle(radians: number, step: number): number {
    return step <= 0 ? radians : Math.round(radians / step) * step;
}
