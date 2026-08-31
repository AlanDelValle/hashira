import type { AssetPrimitive } from './library';

/**
 * Reading an SVG someone made somewhere else.
 *
 * A block is a small drawing in a normalised 0–1 box, and an SVG is a small drawing in a box
 * of its own, so the import is mostly a change of coordinates. What it is not is a general
 * SVG renderer: this reads shapes and paths and throws away everything about *appearance* —
 * fills, strokes, gradients, filters, clipping, text and images. A block is drawn with the
 * drawing's own pen weight on the layer it is placed on, which is the whole reason a plan
 * full of blocks reads as one drawing rather than as a scrapbook.
 *
 * Curves are flattened into polylines. The alternative is a curve primitive that four
 * renderers would have to grow, for shapes that are a few millimetres across on the finished
 * sheet — where the flattening is already finer than the plotter.
 */

/** How many straight segments a curve becomes. */
const CURVE_STEPS = 12;

/** Anything past this is a drawing, not a block, and is refused rather than truncated. */
const MAX_PRIMITIVES = 400;

export type SvgImport =
    | { ok: true; draw: AssetPrimitive[]; width: number; height: number }
    | { ok: false; reason: string };

interface Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(m: Matrix, n: Matrix): Matrix {
    return {
        a: m.a * n.a + m.c * n.b,
        b: m.b * n.a + m.d * n.b,
        c: m.a * n.c + m.c * n.d,
        d: m.b * n.c + m.d * n.d,
        e: m.a * n.e + m.c * n.f + m.e,
        f: m.b * n.e + m.d * n.f + m.f,
    };
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/**
 * Turn an SVG document into the primitives a block is drawn with.
 *
 * The size comes from the SVG's own `viewBox` or `width`/`height`, read as millimetres unless
 * it says otherwise — someone exporting a piece of furniture from another tool has already
 * decided how big it is, and guessing again here would be one more thing to correct.
 */
export function importSvg(source: string): SvgImport {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');

    if (parsed.querySelector('parsererror') !== null) {
        return { ok: false, reason: 'That file is not valid SVG.' };
    }

    const root = parsed.documentElement;

    if (root.tagName.toLowerCase() !== 'svg') {
        return { ok: false, reason: 'That file is not an SVG drawing.' };
    }

    const box = viewBox(root);
    const primitives: AssetPrimitive[] = [];

    walk(root, IDENTITY, primitives);

    if (primitives.length === 0) {
        return { ok: false, reason: 'There are no shapes in that file to make a block from.' };
    }

    if (primitives.length > MAX_PRIMITIVES) {
        return { ok: false, reason: 'That drawing is far too detailed to be a block.' };
    }

    const normalised = primitives.map((primitive) => normalise(primitive, box));

    return {
        ok: true,
        draw: normalised,
        width: Math.max(Math.round(millimetres(root.getAttribute('width'), box.width)), 1),
        height: Math.max(Math.round(millimetres(root.getAttribute('height'), box.height)), 1),
    };
}

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

function viewBox(root: Element): Box {
    const attribute = root.getAttribute('viewBox');
    const numbers =
        attribute === null
            ? []
            : attribute
                  .trim()
                  .split(/[\s,]+/)
                  .map(Number);
    const [x, y, width, height] = numbers;

    if (
        numbers.length === 4 &&
        [x, y, width, height].every((value) => value !== undefined && Number.isFinite(value)) &&
        (width ?? 0) > 0 &&
        (height ?? 0) > 0
    ) {
        return { x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1 };
    }

    const width2 = millimetres(root.getAttribute('width'), 100);
    const height2 = millimetres(root.getAttribute('height'), 100);

    return { x: 0, y: 0, width: width2, height: height2 };
}

/** A length attribute in millimetres. Units other than mm are read at 96 dpi, as SVG says. */
function millimetres(value: string | null, fallback: number): number {
    if (value === null) return fallback;

    const match = /^\s*(-?[\d.]+)\s*([a-z%]*)\s*$/i.exec(value);
    const number = Number(match?.[1]);

    if (match === null || !Number.isFinite(number)) return fallback;

    switch ((match[2] ?? '').toLowerCase()) {
        case 'mm':
        case '':
            return number;
        case 'cm':
            return number * 10;
        case 'm':
            return number * 1000;
        case 'in':
            return number * 25.4;
        case 'pt':
            return (number * 25.4) / 72;
        case 'px':
            return (number * 25.4) / 96;
        default:
            return fallback;
    }
}

/** Depth-first through the document, carrying each element's transform down with it. */
function walk(element: Element, parent: Matrix, out: AssetPrimitive[]): void {
    if (out.length > MAX_PRIMITIVES) {
        return;
    }

    const here = multiply(parent, parseTransform(element.getAttribute('transform')));
    const name = element.tagName.toLowerCase();

    if (name === 'defs' || name === 'symbol' || name === 'clippath' || name === 'mask') {
        return; // Referenced rather than drawn; a block has nothing to refer with.
    }

    const shape = shapeOf(element, name, here);

    if (shape !== null) {
        out.push(...shape);
    }

    for (const child of Array.from(element.children)) {
        walk(child, here, out);
    }
}

function number(element: Element, attribute: string, fallback = 0): number {
    const value = Number(element.getAttribute(attribute));

    return Number.isFinite(value) ? value : fallback;
}

function shapeOf(element: Element, name: string, m: Matrix): AssetPrimitive[] | null {
    switch (name) {
        case 'line': {
            const [x1, y1] = apply(m, number(element, 'x1'), number(element, 'y1'));
            const [x2, y2] = apply(m, number(element, 'x2'), number(element, 'y2'));

            return [{ kind: 'line', x1, y1, x2, y2 }];
        }

        case 'rect': {
            const x = number(element, 'x');
            const y = number(element, 'y');
            const w = number(element, 'width');
            const h = number(element, 'height');

            if (w <= 0 || h <= 0) return null;

            // A polyline rather than a rect, because a transform can turn it and a rect in
            // this format has no angle to turn to.
            const corners: [number, number][] = [
                apply(m, x, y),
                apply(m, x + w, y),
                apply(m, x + w, y + h),
                apply(m, x, y + h),
            ];

            return [{ kind: 'polyline', points: corners.flat(), closed: true }];
        }

        case 'circle':
        case 'ellipse': {
            const cx = number(element, 'cx');
            const cy = number(element, 'cy');
            const r = number(element, 'r');
            const rx = name === 'circle' ? r : number(element, 'rx');
            const ry = name === 'circle' ? r : number(element, 'ry');

            if (rx <= 0 || ry <= 0) return null;

            // Sampled rather than mapped: a rotated ellipse is still an ellipse, but not one
            // this format can say, and a ring of points says the same thing honestly.
            return [ellipseAsRing(cx, cy, rx, ry, m)];
        }

        case 'polyline':
        case 'polygon': {
            const numbers = (element.getAttribute('points') ?? '')
                .trim()
                .split(/[\s,]+/)
                .map(Number)
                .filter((value) => Number.isFinite(value));

            const points: number[] = [];

            for (let i = 0; i + 1 < numbers.length; i += 2) {
                points.push(...apply(m, numbers[i] ?? 0, numbers[i + 1] ?? 0));
            }

            return points.length < 4
                ? null
                : [{ kind: 'polyline', points, closed: name === 'polygon' }];
        }

        case 'path':
            return pathShapes(element.getAttribute('d') ?? '', m);

        default:
            return null;
    }
}

function ellipseAsRing(cx: number, cy: number, rx: number, ry: number, m: Matrix): AssetPrimitive {
    const points: number[] = [];
    const steps = CURVE_STEPS * 2;

    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;

        points.push(...apply(m, cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry));
    }

    return { kind: 'polyline', points, closed: true };
}

/** `transform="translate(…) scale(…) rotate(…) matrix(…)"`, applied left to right. */
function parseTransform(value: string | null): Matrix {
    if (value === null || value.trim() === '') {
        return IDENTITY;
    }

    let result = IDENTITY;

    for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
        const args = (match[2] ?? '')
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n));

        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = args;

        switch ((match[1] ?? '').toLowerCase()) {
            case 'translate':
                result = multiply(result, { ...IDENTITY, e: a, f: args.length > 1 ? b : 0 });
                break;

            case 'scale':
                result = multiply(result, {
                    ...IDENTITY,
                    a,
                    d: args.length > 1 ? b : a,
                });
                break;

            case 'rotate': {
                const radians = (a * Math.PI) / 180;
                const rotation: Matrix = {
                    a: Math.cos(radians),
                    b: Math.sin(radians),
                    c: -Math.sin(radians),
                    d: Math.cos(radians),
                    e: 0,
                    f: 0,
                };

                // The two-argument form turns about a point rather than about the origin.
                result =
                    args.length >= 3
                        ? multiply(
                              multiply(multiply(result, { ...IDENTITY, e: b, f: c }), rotation),
                              { ...IDENTITY, e: -b, f: -c },
                          )
                        : multiply(result, rotation);
                break;
            }

            case 'matrix':
                result = multiply(result, { a, b, c, d, e, f });
                break;

            default:
                break; // skewX and skewY are not something a block needs to say.
        }
    }

    return result;
}

/**
 * Path data, as polylines.
 *
 * Every command is followed to the letter except the ones that only affect appearance, and
 * curves are walked at a fixed number of steps. Arcs are the one place this is approximate in
 * a way worth naming: the elliptical arc is sampled the same way a bezier is.
 */
function pathShapes(d: string, m: Matrix): AssetPrimitive[] {
    const commands = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)];
    const shapes: AssetPrimitive[] = [];

    let current: number[] = [];
    let closed = false;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let lastControl: [number, number] | null = null;

    const push = (px: number, py: number): void => {
        current.push(...apply(m, px, py));
    };

    const flush = (): void => {
        if (current.length >= 4) {
            shapes.push({ kind: 'polyline', points: current, closed });
        }

        current = [];
        closed = false;
    };

    for (const [, letter = '', rest = ''] of commands) {
        const args = rest
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .filter((value) => Number.isFinite(value));

        const relative = letter === letter.toLowerCase();
        const command = letter.toUpperCase();

        if (command === 'Z') {
            closed = true;
            flush();
            x = startX;
            y = startY;
            continue;
        }

        const step = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[command] ?? 2;

        for (let i = 0; i + step <= args.length || (i === 0 && args.length === 0); i += step) {
            const at = (index: number): number => args[i + index] ?? 0;

            switch (command) {
                case 'M': {
                    // A second pair after a move is an implicit line, which is why this runs
                    // in the same loop rather than once.
                    const nx = relative ? x + at(0) : at(0);
                    const ny = relative ? y + at(1) : at(1);

                    if (i === 0) {
                        flush();
                        startX = nx;
                        startY = ny;
                    }

                    x = nx;
                    y = ny;
                    push(x, y);
                    break;
                }

                case 'L':
                    x = relative ? x + at(0) : at(0);
                    y = relative ? y + at(1) : at(1);
                    push(x, y);
                    break;

                case 'H':
                    x = relative ? x + at(0) : at(0);
                    push(x, y);
                    break;

                case 'V':
                    y = relative ? y + at(0) : at(0);
                    push(x, y);
                    break;

                case 'C':
                case 'S': {
                    const first: [number, number] =
                        command === 'C'
                            ? [relative ? x + at(0) : at(0), relative ? y + at(1) : at(1)]
                            : (lastControl ?? [x, y]);

                    const [c1x, c1y] = first;

                    const offset = command === 'C' ? 2 : 0;
                    const c2x = relative ? x + at(offset) : at(offset);
                    const c2y = relative ? y + at(offset + 1) : at(offset + 1);
                    const ex = relative ? x + at(offset + 2) : at(offset + 2);
                    const ey = relative ? y + at(offset + 3) : at(offset + 3);

                    for (let s = 1; s <= CURVE_STEPS; s++) {
                        const t = s / CURVE_STEPS;
                        push(...cubic(x, y, c1x, c1y, c2x, c2y, ex, ey, t));
                    }

                    lastControl = [2 * ex - c2x, 2 * ey - c2y];
                    x = ex;
                    y = ey;
                    break;
                }

                case 'Q':
                case 'T': {
                    const control: [number, number] =
                        command === 'Q'
                            ? [relative ? x + at(0) : at(0), relative ? y + at(1) : at(1)]
                            : (lastControl ?? [x, y]);

                    const [qx, qy] = control;

                    const offset = command === 'Q' ? 2 : 0;
                    const ex = relative ? x + at(offset) : at(offset);
                    const ey = relative ? y + at(offset + 1) : at(offset + 1);

                    for (let s = 1; s <= CURVE_STEPS; s++) {
                        const t = s / CURVE_STEPS;
                        const u = 1 - t;

                        push(
                            u * u * x + 2 * u * t * qx + t * t * ex,
                            u * u * y + 2 * u * t * qy + t * t * ey,
                        );
                    }

                    lastControl = [2 * ex - qx, 2 * ey - qy];
                    x = ex;
                    y = ey;
                    break;
                }

                case 'A': {
                    const ex = relative ? x + at(5) : at(5);
                    const ey = relative ? y + at(6) : at(6);

                    for (const [px, py] of arcPoints(
                        x,
                        y,
                        at(0),
                        at(1),
                        at(2),
                        at(3) !== 0,
                        at(4) !== 0,
                        ex,
                        ey,
                    )) {
                        push(px, py);
                    }

                    x = ex;
                    y = ey;
                    break;
                }

                default:
                    break;
            }

            if (command !== 'C' && command !== 'S' && command !== 'Q' && command !== 'T') {
                lastControl = null;
            }

            if (args.length === 0) break;
        }
    }

    flush();

    return shapes;
}

function cubic(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    t: number,
): [number, number] {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;

    return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

/** An elliptical arc, sampled — the endpoint parameterisation SVG defines, walked in steps. */
function arcPoints(
    x0: number,
    y0: number,
    rx: number,
    ry: number,
    rotation: number,
    largeArc: boolean,
    sweep: boolean,
    x1: number,
    y1: number,
): [number, number][] {
    if (rx === 0 || ry === 0) {
        return [[x1, y1]];
    }

    const phi = (rotation * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);

    const dx = (x0 - x1) / 2;
    const dy = (y0 - y1) / 2;
    const x1p = cos * dx + sin * dy;
    const y1p = -sin * dx + cos * dy;

    let a = Math.abs(rx);
    let b = Math.abs(ry);

    // A radius too small to reach is scaled up until it does, which is what SVG asks for.
    const lambda = (x1p * x1p) / (a * a) + (y1p * y1p) / (b * b);

    if (lambda > 1) {
        a *= Math.sqrt(lambda);
        b *= Math.sqrt(lambda);
    }

    const numerator = a * a * b * b - a * a * y1p * y1p - b * b * x1p * x1p;
    const denominator = a * a * y1p * y1p + b * b * x1p * x1p;
    const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(numerator / denominator, 0));

    const cxp = (factor * a * y1p) / b;
    const cyp = (-factor * b * x1p) / a;
    const cx = cos * cxp - sin * cyp + (x0 + x1) / 2;
    const cy = sin * cxp + cos * cyp + (y0 + y1) / 2;

    const start = Math.atan2((y1p - cyp) / b, (x1p - cxp) / a);
    const end = Math.atan2((-y1p - cyp) / b, (-x1p - cxp) / a);

    let sweepAngle = end - start;

    if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2;
    if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2;

    const points: [number, number][] = [];

    for (let i = 1; i <= CURVE_STEPS; i++) {
        const angle = start + (sweepAngle * i) / CURVE_STEPS;
        const px = cx + a * Math.cos(angle) * cos - b * Math.sin(angle) * sin;
        const py = cy + a * Math.cos(angle) * sin + b * Math.sin(angle) * cos;

        points.push([px, py]);
    }

    return points;
}

/** From the SVG's own coordinates into the block's 0–1 box. */
function normalise(primitive: AssetPrimitive, box: Box): AssetPrimitive {
    const nx = (value: number): number => (value - box.x) / box.width;
    const ny = (value: number): number => (value - box.y) / box.height;

    switch (primitive.kind) {
        case 'line':
            return {
                kind: 'line',
                x1: nx(primitive.x1),
                y1: ny(primitive.y1),
                x2: nx(primitive.x2),
                y2: ny(primitive.y2),
            };

        case 'polyline': {
            const points = primitive.points.map((value, index) =>
                index % 2 === 0 ? nx(value) : ny(value),
            );

            return { kind: 'polyline', points, closed: primitive.closed };
        }

        case 'rect':
            return {
                kind: 'rect',
                x: nx(primitive.x),
                y: ny(primitive.y),
                w: primitive.w / box.width,
                h: primitive.h / box.height,
            };

        case 'ellipse':
            return {
                kind: 'ellipse',
                cx: nx(primitive.cx),
                cy: ny(primitive.cy),
                rx: primitive.rx / box.width,
                ry: primitive.ry / box.height,
            };

        case 'arc':
            return {
                kind: 'arc',
                cx: nx(primitive.cx),
                cy: ny(primitive.cy),
                r: primitive.r / Math.min(box.width, box.height),
                from: primitive.from,
                to: primitive.to,
            };
    }
}
