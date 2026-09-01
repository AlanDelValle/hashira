import { TAU, toDegrees } from '@/editor/geometry/angle';
import type { Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import type { SceneLayer, ScenePrimitive } from '@/editor/scene/types';

/**
 * DXF export.
 *
 * The fifth thing that reads the scene, and the first that is not a picture. A DXF is
 * geometry somebody else's software will edit, which changes what "faithful" means: what
 * travels is shapes on layers at full size, and everything about *appearance* is left behind.
 *
 * Three decisions are worth stating, because each of them looks like a limitation and is
 * actually the trade:
 *
 * **It is written from the scene, not from the document.** So a wall arrives as the shape a
 * wall is drawn as — a closed outline with its openings cut — rather than as a wall. DXF has
 * no idea what a wall is, and a plan that exported walls as bare centrelines would open as a
 * diagram of a plan rather than as one.
 *
 * **The target is R12 (AC1009)**, the oldest dialect still in use and the one that opens
 * everywhere. It costs the things R12 does not have: no lineweights, so a pen weight is lost;
 * no `LWPOLYLINE`, so a polyline is the older `POLYLINE`/`VERTEX`/`SEQEND`; no `HATCH`, so
 * nothing is filled. A wall's poché leaves as the outline of its poché, which is what a
 * drafter would hatch on arrival anyway.
 *
 * **There is no page.** A DXF is model space at full size, so it has no scale, no sheet and
 * no title block — the drawing's scale is a decision about paper, and paper is what the PDF
 * is for.
 */

export interface DxfOptions {
    /** The drawing's extent, written into the header so a reader can zoom to it. */
    bounds: Bounds;
}

/** How many segments a full ellipse becomes. R12 has no ellipse; curves flatten. */
const ELLIPSE_SEGMENTS = 48;

/** A layer name R12 will take: letters, digits and a few marks, and not too many of them. */
const MAX_LAYER_NAME = 31;

export function sceneToDxf(layers: readonly SceneLayer[], options: DxfOptions): string {
    const out: string[] = [];
    const pair = (code: number, value: string | number): void => {
        out.push(String(code), String(value));
    };

    const names = layerNames(layers);

    header(pair, options.bounds);
    tables(pair, layers, names);

    pair(0, 'SECTION');
    pair(2, 'ENTITIES');

    for (const layer of layers) {
        const name = names.get(layer.id) ?? '0';

        for (const primitive of layer.primitives) {
            entity(pair, primitive, name);
        }
    }

    pair(0, 'ENDSEC');
    pair(0, 'EOF');

    // CRLF, which is what DXF has always been written with; every reader takes either.
    return `${out.join('\r\n')}\r\n`;
}

type Pair = (code: number, value: string | number) => void;

function header(pair: Pair, bounds: Bounds): void {
    pair(0, 'SECTION');
    pair(2, 'HEADER');

    pair(9, '$ACADVER');
    pair(1, 'AC1009');

    /*
     * Millimetres. `$INSUNITS` postdates R12, so a reader old enough to care will skip it and
     * assume its own units — but stating it is what stops a modern one from importing a six
     * metre wall as six metres of inches.
     */
    pair(9, '$INSUNITS');
    pair(70, 4);

    // Flipping y turns the extent inside out: the bottom of the drawing is the top of the file.
    pair(9, '$EXTMIN');
    pair(10, num(bounds.minX));
    pair(20, num(-bounds.maxY));
    pair(30, num(0));

    pair(9, '$EXTMAX');
    pair(10, num(bounds.maxX));
    pair(20, num(-bounds.minY));
    pair(30, num(0));

    pair(0, 'ENDSEC');
}

function tables(pair: Pair, layers: readonly SceneLayer[], names: Map<string, string>): void {
    pair(0, 'SECTION');
    pair(2, 'TABLES');
    pair(0, 'TABLE');
    pair(2, 'LAYER');
    pair(70, layers.length + 1);

    // Layer 0 always exists in a DXF, and a reader that meets an entity on a layer the file
    // never declared puts it here.
    layerRecord(pair, '0', 7);

    for (const layer of layers) {
        layerRecord(pair, names.get(layer.id) ?? '0', colourIndex(layer.primitives));
    }

    pair(0, 'ENDTAB');
    pair(0, 'ENDSEC');
}

function layerRecord(pair: Pair, name: string, colour: number): void {
    pair(0, 'LAYER');
    pair(2, name);
    pair(70, 0);
    pair(62, colour);
    pair(6, 'CONTINUOUS');
}

/**
 * Names R12 will accept, each one still telling you which layer it was.
 *
 * R12 layer names are upper case and hold letters, digits, `$`, `-` and `_`. "Ground floor"
 * is not one of them, and two layers reduced to the same name would silently merge on the way
 * out, so a collision is numbered rather than allowed.
 */
export function layerNames(layers: readonly SceneLayer[]): Map<string, string> {
    const taken = new Set(['0']);
    const names = new Map<string, string>();

    for (const layer of layers) {
        const base =
            layer.name
                .toUpperCase()
                .replace(/[^\dA-Z$_-]+/g, '_')
                .slice(0, MAX_LAYER_NAME)
                .replace(/^_+|_+$/g, '') || 'LAYER';

        let name = base;

        for (let suffix = 2; taken.has(name); suffix++) {
            name = `${base.slice(0, MAX_LAYER_NAME - 2)}_${suffix}`;
        }

        taken.add(name);
        names.set(layer.id, name);
    }

    return names;
}

/**
 * A layer's colour as an AutoCAD colour index.
 *
 * The scene carries colour per primitive, since a highlight paints over the drawing's own
 * palette; a DXF carries it per layer, so the first thing drawn on the layer decides. That is
 * the layer's own colour in every export, because an exported scene has no highlights in it.
 */
function colourIndex(primitives: readonly ScenePrimitive[]): number {
    for (const primitive of primitives) {
        const colour =
            primitive.kind === 'text'
                ? primitive.fill
                : (primitive.stroke?.color ?? ('fill' in primitive ? primitive.fill : null));

        if (typeof colour === 'string') {
            return nearestAci(colour);
        }
    }

    return 7;
}

/**
 * The nearest of the seven colours every DXF reader agrees about.
 *
 * Matched by hue rather than by distance in RGB, because the two are not the same question: a
 * quiet blue and a mid grey are neighbours in RGB and are never the same decision on a
 * drawing. Anything with almost no chroma is a grey and is placed by how dark it is — where 7
 * is the one that comes out black on white paper and white on black, which is what ink wants.
 */
export function nearestAci(hex: string): number {
    const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());

    if (match === null) {
        return 7;
    }

    const r = Number.parseInt(match[1] ?? '0', 16);
    const g = Number.parseInt(match[2] ?? '0', 16);
    const b = Number.parseInt(match[3] ?? '0', 16);

    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);

    if (chroma < 40) {
        return max < 96 ? 7 : max < 192 ? 8 : 9;
    }

    const hue =
        max === r
            ? ((g - b) / chroma + 6) % 6
            : max === g
              ? (b - r) / chroma + 2
              : (r - g) / chroma + 4;

    // 0 red, 1 yellow, 2 green, 3 cyan, 4 blue, 5 magenta — the first six indices, in order.
    return (Math.round(hue) % 6) + 1;
}

function entity(pair: Pair, primitive: ScenePrimitive, layer: string): void {
    switch (primitive.kind) {
        case 'polyline':
            polyline(pair, primitive.points, primitive.closed, layer);
            break;

        case 'area':
            // A ring at a time: the outline of the poché, with its holes as rings of their own.
            for (const ring of primitive.rings) {
                polyline(pair, ring, true, layer);
            }

            break;

        case 'circle':
            pair(0, 'CIRCLE');
            pair(8, layer);
            point(pair, primitive.centre);
            pair(40, num(primitive.radius));
            break;

        case 'ellipse':
            polyline(pair, flattenEllipse(primitive), true, layer);
            break;

        case 'arc': {
            /*
             * The drawing measures angles clockwise in a world where y grows downward; a DXF
             * measures them anticlockwise in one where it grows upward. Mirroring y negates
             * every angle and reverses the direction of travel with them, so an arc drawn one
             * way round here is written the other way round there — and a DXF arc always runs
             * anticlockwise from its start, which is why the two ends swap.
             */
            const [from, to] = primitive.anticlockwise
                ? [-primitive.from, -primitive.to]
                : [-primitive.to, -primitive.from];

            pair(0, 'ARC');
            pair(8, layer);
            point(pair, primitive.centre);
            pair(40, num(primitive.radius));
            pair(50, num(degrees(from)));
            pair(51, num(degrees(to)));
            break;
        }

        case 'text': {
            const justify = primitive.align === 'center' ? 1 : primitive.align === 'right' ? 2 : 0;

            pair(0, 'TEXT');
            pair(8, layer);
            point(pair, primitive.at);
            pair(40, num(primitive.size));
            // A DXF string is one line. A label that was typed with a break in it is written
            // through rather than dropped, and rather than ending the entity early.
            pair(1, primitive.content.replace(/[\n\r]+/g, ' '));

            if (primitive.rotation !== 0) {
                pair(50, num(degrees(-primitive.rotation)));
            }

            if (justify !== 0) {
                // Anything but left-justified is placed by its alignment point, which readers
                // take from 11/21 — 10/20 is then along for the ride and set to the same spot.
                pair(72, justify);
                pair(11, num(primitive.at.x));
                pair(21, num(-primitive.at.y));
                pair(31, num(0));
            }

            break;
        }
    }
}

/** `POLYLINE`, `VERTEX`… `SEQEND` — what a polyline is before R13. */
function polyline(pair: Pair, points: readonly Point[], closed: boolean, layer: string): void {
    if (points.length < 2) {
        return;
    }

    // Two points and no closing edge is a line, and saying so is worth it: half of what a
    // measured plan is made of arrives as something a drafter can grab an end of.
    if (points.length === 2 && !closed) {
        pair(0, 'LINE');
        pair(8, layer);
        point(pair, points[0]!);
        pair(11, num(points[1]!.x));
        pair(21, num(-points[1]!.y));
        pair(31, num(0));

        return;
    }

    pair(0, 'POLYLINE');
    pair(8, layer);
    // 66: vertices follow. R12 requires it, and a reader that does not find it stops here.
    pair(66, 1);
    pair(70, closed ? 1 : 0);
    pair(10, num(0));
    pair(20, num(0));
    pair(30, num(0));

    for (const at of points) {
        pair(0, 'VERTEX');
        pair(8, layer);
        point(pair, at);
    }

    pair(0, 'SEQEND');
    pair(8, layer);
}

/** A point, with y mirrored: the drawing grows downward and a DXF grows upward. */
function point(pair: Pair, at: Point): void {
    pair(10, num(at.x));
    pair(20, num(-at.y));
    pair(30, num(0));
}

function flattenEllipse(primitive: Extract<ScenePrimitive, { kind: 'ellipse' }>): Point[] {
    const cos = Math.cos(primitive.rotation);
    const sin = Math.sin(primitive.rotation);

    return Array.from({ length: ELLIPSE_SEGMENTS }, (_, step) => {
        const angle = (step / ELLIPSE_SEGMENTS) * TAU;
        const x = primitive.rx * Math.cos(angle);
        const y = primitive.ry * Math.sin(angle);

        return {
            x: primitive.centre.x + x * cos - y * sin,
            y: primitive.centre.y + x * sin + y * cos,
        };
    });
}

/** Radians to degrees in 0–360, which is the only range a DXF angle is written in. */
function degrees(radians: number): number {
    return ((toDegrees(radians) % 360) + 360) % 360;
}

/**
 * A number a DXF reader will take: no exponent, and always a decimal point, which is what
 * every writer since 1990 has produced and what the more literal-minded readers expect.
 */
function num(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    const written = String(Object.is(rounded, -0) ? 0 : rounded);

    return written.includes('.') ? written : `${written}.0`;
}
