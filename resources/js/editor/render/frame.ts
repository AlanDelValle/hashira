/**
 * A single indirection so that tools and input handlers can ask for a repaint without
 * carrying a reference to the renderer through every call.
 */
let invalidate: (() => void) | null = null;

export function setInvalidator(fn: (() => void) | null): void {
    invalidate = fn;
}

export function requestRepaint(): void {
    invalidate?.();
}
