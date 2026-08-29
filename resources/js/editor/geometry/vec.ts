/**
 * Two-dimensional vector maths.
 *
 * Everything here is a pure function over plain objects — no classes, no mutation, no DOM.
 * Points are millimetres in world space unless a caller says otherwise, and angles are
 * radians measured clockwise, because the Y axis grows downward.
 */

export interface Point {
    x: number;
    y: number;
}

export const ORIGIN: Point = Object.freeze({ x: 0, y: 0 });

export function point(x: number, y: number): Point {
    return { x, y };
}

export function add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point, factor: number): Point {
    return { x: a.x * factor, y: a.y * factor };
}

export function negate(a: Point): Point {
    return { x: -a.x, y: -a.y };
}

export function dot(a: Point, b: Point): number {
    return a.x * b.x + a.y * b.y;
}

/** The z component of the 3D cross product; its sign tells you which side b is on. */
export function cross(a: Point, b: Point): number {
    return a.x * b.y - a.y * b.x;
}

export function lengthSquared(a: Point): number {
    return a.x * a.x + a.y * a.y;
}

export function length(a: Point): number {
    return Math.hypot(a.x, a.y);
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceSquared(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return dx * dx + dy * dy;
}

/** Returns the zero vector unchanged rather than dividing by zero. */
export function normalize(a: Point): Point {
    const len = length(a);

    return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Rotated a quarter turn; useful for wall offsets and dimension lines. */
export function perpendicular(a: Point): Point {
    return { x: -a.y, y: a.x };
}

export function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function rotate(a: Point, radians: number): Point {
    if (radians === 0) {
        return { x: a.x, y: a.y };
    }

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return { x: a.x * cos - a.y * sin, y: a.x * sin + a.y * cos };
}

export function rotateAround(a: Point, pivot: Point, radians: number): Point {
    return add(rotate(subtract(a, pivot), radians), pivot);
}

/** The direction from the origin to `a`, in radians. */
export function angleOf(a: Point): number {
    return Math.atan2(a.y, a.x);
}

export function angleBetween(from: Point, to: Point): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

export function equals(a: Point, b: Point, epsilon = 1e-9): boolean {
    return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}
