import { TAU } from '@/editor/geometry/angle';
import { distance, type Point } from '@/editor/geometry/vec';
import { createCircle, createLine, createPolygon, createText } from '@/editor/model/factories';
import type { Element, TextAlign } from '@/editor/model/types';

/**
 * Reading a DXF somebody else drew.
 *
 * This is the first thing in the editor that runs the pipeline backwards. Everything else
 * takes the document and produces something; this takes a file and produces elements, and the
 * gap between those two jobs is the whole difficulty: a DXF is *geometry*, and a drawing here
 * is walls, openings and rooms. Nothing in a DXF says which lines are a wall — so nothing
 * imported becomes one. What arrives is shapes on layers, honestly labelled as such, for
 * somebody to draw over or measure against.
 *
 * Reading happens in two steps, because the person has to be asked something in between:
 *
 *   text ──▶ `readDxf` ──▶ shapes in the file's own units and axes
 *                            ├─ what layers there are, and how much is on each
 *                            ├─ what units the file claims
 *                            └─ what was in it that could not come
 *        ──▶ `dxfElements` ──▶ elements, in millimetres, y the right way round
 *
 * Curves flatten. A DXF has arcs, ellipses and splines; the document has a circle and a
 * polygon, and a new element type would cost a schema version and a branch in five outputs
 * for shapes that are already flattened finer than a plotter draws them. A circle is the one
 * curve that survives, because there is somewhere to put it.
 */

/** What `$INSUNITS` can say, as a multiplier onto millimetres. */
export const DXF_UNITS = {
    mm: 1,
    cm: 10,
    m: 1000,
    inch: 25.4,
    foot: 304.8,
} as const;

export type DxfUnit = keyof typeof DXF_UNITS;

/** `$INSUNITS` values this reader recognises. 0 means the file declines to say. */
const INSUNITS: Record<number, DxfUnit> = {
    1: 'inch',
    2: 'foot',
    4: 'mm',
    5: 'cm',
    6: 'm',
};

/** How many segments a full turn of a curve becomes. */
const CURVE_SEGMENTS = 48;

/**
 * The most a single import will bring in.
 *
 * A drawing is one JSON document, saved whole on every autosave, and the server will not take
 * one past eight megabytes — so an import is bounded by what a drawing can carry rather than
 * by what a reader can parse. Ten thousand elements is a few megabytes of document and a plan
 * that still pans smoothly; a site survey with a quarter of a million entities is not a plan
 * to draw over, it is a different tool's file, and being told so beats a drawing that will not
 * save.
 */
export const MAX_IMPORT_ELEMENTS = 10_000;

/** A block that references itself, however indirectly, would otherwise never finish. */
const MAX_INSERT_DEPTH = 8;

/**
 * A shape from the file, in the file's own coordinates.
 *
 * Three kinds, which is all a DXF's dozens of entity types come to once curves are flattened
 * and blocks are exploded.
 */
export type DxfShape =
    | { kind: 'polyline'; layer: string; points: Point[]; closed: boolean }
    | { kind: 'circle'; layer: string; centre: Point; radius: number }
    | {
          kind: 'text';
          layer: string;
          at: Point;
          content: string;
          height: number;
          /** Anticlockwise radians, as the file has it. */
          rotation: number;
          align: TextAlign;
      };

export interface DxfLayer {
    name: string;
    /** The layer's colour, from its AutoCAD colour index. */
    color: string;
    visible: boolean;
    locked: boolean;
    /** How many shapes came off this layer. */
    count: number;
}

export interface DxfDrawing {
    /** What the file says its units are, or null when it does not say. */
    unit: DxfUnit | null;
    layers: DxfLayer[];
    shapes: DxfShape[];
    /** Entity types that produced nothing, and how many of each, so the summary can say so. */
    skipped: { type: string; count: number }[];
}

export type DxfRead = { ok: true; drawing: DxfDrawing } | { ok: false; reason: string };

type Groups = [number, string][];

interface Entity {
    type: string;
    groups: Groups;
}

/** A transform applied to a block's contents when it is placed: scale, turn, then move. */
interface Placement {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

const IDENTITY: Placement = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

export function readDxf(text: string): DxfRead {
    const pairs = groupPairs(text);

    if (pairs.length === 0) {
        return { ok: false, reason: 'This file is not a DXF, or it is empty.' };
    }

    const sections = split(pairs);

    if (!sections.has('ENTITIES')) {
        return {
            ok: false,
            reason: 'This DXF has no entities section, so there is nothing in it.',
        };
    }

    const reader = new Reader(blocks(sections.get('BLOCKS') ?? []));

    reader.read(sections.get('ENTITIES') ?? [], IDENTITY, 0);

    const declared = layerTable(sections.get('TABLES') ?? []);
    const used = new Map<string, number>();

    for (const shape of reader.shapes) {
        used.set(shape.layer, (used.get(shape.layer) ?? 0) + 1);
    }

    const layers = [...used.entries()].map(([name, count]): DxfLayer => {
        const declaration = declared.get(name);

        return {
            name,
            color: declaration?.color ?? INK,
            visible: declaration?.visible ?? true,
            locked: declaration?.locked ?? false,
            count,
        };
    });

    return {
        ok: true,
        drawing: {
            unit: units(sections.get('HEADER') ?? []),
            layers: layers.sort((a, b) => a.name.localeCompare(b.name)),
            shapes: reader.shapes,
            skipped: [...reader.skipped.entries()]
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count),
        },
    };
}

/**
 * The file, as the pairs of lines it is.
 *
 * A DXF is a code on one line and its value on the next, forever. Everything above is an
 * interpretation of this list and nothing else.
 */
function groupPairs(text: string): Groups {
    const lines = text.split(/\r?\n/);
    const pairs: Groups = [];

    for (let at = 0; at + 1 < lines.length; at += 2) {
        const code = Number((lines[at] ?? '').trim());

        if (!Number.isInteger(code)) {
            // A binary DXF, or a text file that is not one. Either way this reader is done.
            return [];
        }

        pairs.push([code, (lines[at + 1] ?? '').trim()]);
    }

    return pairs;
}

function split(pairs: Groups): Map<string, Groups> {
    const sections = new Map<string, Groups>();

    for (let at = 0; at < pairs.length; at++) {
        if (pairs[at]?.[0] !== 0 || pairs[at]?.[1] !== 'SECTION') continue;

        const name = pairs[at + 1]?.[0] === 2 ? pairs[at + 1]![1] : '';
        const from = at + 2;
        let to = from;

        while (to < pairs.length && !(pairs[to]?.[0] === 0 && pairs[to]?.[1] === 'ENDSEC')) {
            to++;
        }

        sections.set(name, pairs.slice(from, to));
        at = to;
    }

    return sections;
}

/** The pairs of a section, cut into records at every group 0. */
function records(pairs: Groups): Entity[] {
    const out: Entity[] = [];

    for (const [code, value] of pairs) {
        if (code === 0) {
            out.push({ type: value, groups: [] });
        } else {
            out[out.length - 1]?.groups.push([code, value]);
        }
    }

    return out;
}

function first(groups: Groups, code: number): string | undefined {
    return groups.find(([at]) => at === code)?.[1];
}

function number(groups: Groups, code: number, fallback: number): number {
    const value = first(groups, code);
    const parsed = value === undefined ? Number.NaN : Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
}

function units(header: Groups): DxfUnit | null {
    for (let at = 0; at < header.length; at++) {
        if (header[at]?.[0] === 9 && header[at]?.[1] === '$INSUNITS') {
            return INSUNITS[Number(header[at + 1]?.[1] ?? '0')] ?? null;
        }
    }

    return null;
}

/** The ink a drawing is drawn in, for a layer whose colour index means nothing here. */
const INK = '#1F2328';

/** The colour indices every DXF agrees about. Anything else arrives as ink. */
const ACI: Record<number, string> = {
    1: '#D22B2B',
    2: '#B8A000',
    3: '#2E8B2E',
    4: '#1F8A8A',
    5: '#2C58C4',
    6: '#A33BA3',
    7: INK,
    8: '#5F636B',
    9: '#8A8F98',
    250: '#333333',
    251: '#505050',
    252: '#696969',
    253: '#828282',
    254: '#BEBEBE',
    255: INK,
};

interface LayerDeclaration {
    color: string;
    visible: boolean;
    locked: boolean;
}

function layerTable(tables: Groups): Map<string, LayerDeclaration> {
    const declared = new Map<string, LayerDeclaration>();

    for (const record of records(tables)) {
        if (record.type !== 'LAYER') continue;

        const name = first(record.groups, 2);

        if (name === undefined) continue;

        const colour = number(record.groups, 62, 7);
        const flags = number(record.groups, 70, 0);

        declared.set(name, {
            color: ACI[Math.abs(colour)] ?? INK,
            // A negative colour index is how a DXF says a layer is switched off; bit 1 of the
            // flags is how it says the layer is frozen. Both mean "not on the drawing".
            visible: colour >= 0 && (flags & 1) === 0,
            locked: (flags & 4) !== 0,
        });
    }

    return declared;
}

/** Every block definition in the file, by name. */
function blocks(section: Groups): Map<string, Groups> {
    const defined = new Map<string, Groups>();

    for (let at = 0; at < section.length; at++) {
        if (section[at]?.[0] !== 0 || section[at]?.[1] !== 'BLOCK') continue;

        let to = at + 1;
        let name: string | undefined;

        while (to < section.length && !(section[to]?.[0] === 0 && section[to]?.[1] === 'ENDBLK')) {
            if (section[to]?.[0] === 2 && name === undefined) name = section[to]![1];
            to++;
        }

        if (name !== undefined) {
            /*
             * From the name onwards, which skips the block's own header pairs. A block is
             * defined about its base point and placed relative to it, and the base point is
             * subtracted when the block is placed rather than here.
             */
            defined.set(name, section.slice(at + 1, to));
        }

        at = to;
    }

    return defined;
}

class Reader {
    readonly shapes: DxfShape[] = [];
    readonly skipped = new Map<string, number>();

    constructor(private readonly blocks: Map<string, Groups>) {}

    read(pairs: Groups, at: Placement, depth: number): void {
        const entities = records(pairs);

        for (let index = 0; index < entities.length; index++) {
            const record = entities[index];

            if (record === undefined) continue;

            switch (record.type) {
                case 'LINE':
                    this.push(at, {
                        kind: 'polyline',
                        layer: layerOf(record),
                        points: [
                            { x: number(record.groups, 10, 0), y: number(record.groups, 20, 0) },
                            { x: number(record.groups, 11, 0), y: number(record.groups, 21, 0) },
                        ],
                        closed: false,
                    });
                    break;

                case 'LWPOLYLINE':
                    this.push(at, lwPolyline(record));
                    break;

                case 'POLYLINE': {
                    // The old form: the vertices are records of their own, up to a SEQEND.
                    const vertices: Entity[] = [];

                    while (
                        index + 1 < entities.length &&
                        entities[index + 1]?.type !== 'SEQEND' &&
                        entities[index + 1] !== undefined
                    ) {
                        index++;

                        if (entities[index]?.type === 'VERTEX') vertices.push(entities[index]!);
                    }

                    index++;
                    this.push(at, oldPolyline(record, vertices));
                    break;
                }

                case 'CIRCLE':
                    this.push(at, {
                        kind: 'circle',
                        layer: layerOf(record),
                        centre: {
                            x: number(record.groups, 10, 0),
                            y: number(record.groups, 20, 0),
                        },
                        radius: number(record.groups, 40, 0),
                    });
                    break;

                case 'ARC':
                    this.push(at, arc(record));
                    break;

                case 'ELLIPSE':
                    this.push(at, ellipse(record));
                    break;

                case 'SOLID':
                case 'TRACE':
                    this.push(at, solid(record));
                    break;

                case 'TEXT':
                    this.push(at, text(record));
                    break;

                case 'MTEXT':
                    this.push(at, mtext(record));
                    break;

                case 'SPLINE':
                    this.push(at, spline(record), 'SPLINE');
                    break;

                case 'INSERT':
                    this.place(record, at, depth);
                    break;

                case 'DIMENSION':
                    /*
                     * A dimension carries a block of the lines and text it is drawn as, and
                     * that block is written in world coordinates — so it is exploded where it
                     * stands rather than at the dimension's own definition point. What comes
                     * in is the picture of a measurement, because a measurement here is read
                     * off its own geometry and there is nothing in a DXF to rebuild that from.
                     */
                    this.explode(first(record.groups, 2), at, depth, 'DIMENSION');
                    break;

                case 'VERTEX':
                case 'SEQEND':
                case 'ATTRIB':
                case 'ENDBLK':
                    break;

                default:
                    this.miss(record.type);
            }
        }
    }

    private push(at: Placement, shape: DxfShape | null, missed?: string): void {
        if (shape === null) {
            this.miss(missed ?? 'unknown');

            return;
        }

        this.shapes.push(placed(shape, at));
    }

    private miss(type: string): void {
        this.skipped.set(type, (this.skipped.get(type) ?? 0) + 1);
    }

    private place(record: Entity, at: Placement, depth: number): void {
        const name = first(record.groups, 2);
        const base = this.blocks.get(name ?? '');

        if (base === undefined) {
            this.miss('INSERT');

            return;
        }

        const inner: Placement = {
            x: number(record.groups, 10, 0),
            y: number(record.groups, 20, 0),
            scaleX: number(record.groups, 41, 1),
            scaleY: number(record.groups, 42, 1),
            rotation: (number(record.groups, 50, 0) * TAU) / 360,
        };

        this.explode(name, compose(at, inner), depth, 'INSERT');
    }

    private explode(name: string | undefined, at: Placement, depth: number, why: string): void {
        const base = this.blocks.get(name ?? '');

        if (base === undefined || depth >= MAX_INSERT_DEPTH) {
            this.miss(why);

            return;
        }

        this.read(base, at, depth + 1);
    }
}

function layerOf(record: Entity): string {
    const name = first(record.groups, 8);

    return name === undefined || name === '' ? '0' : name;
}

/** Place a block's shape: its own transform, then the one it is being placed with. */
function placed(shape: DxfShape, at: Placement): DxfShape {
    if (at === IDENTITY) {
        return shape;
    }

    const cos = Math.cos(at.rotation);
    const sin = Math.sin(at.rotation);

    const move = (p: Point): Point => {
        const x = p.x * at.scaleX;
        const y = p.y * at.scaleY;

        return { x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos };
    };

    switch (shape.kind) {
        case 'polyline':
            return { ...shape, points: shape.points.map(move) };

        case 'circle':
            // A block scaled differently in x and y turns its circles into ellipses. Rather
            // than lose that, the circle becomes the polygon it has been squashed into.
            return at.scaleX === at.scaleY
                ? { ...shape, centre: move(shape.centre), radius: shape.radius * at.scaleX }
                : {
                      kind: 'polyline',
                      layer: shape.layer,
                      closed: true,
                      points: turn(CURVE_SEGMENTS).map((angle) =>
                          move({
                              x: shape.centre.x + shape.radius * Math.cos(angle),
                              y: shape.centre.y + shape.radius * Math.sin(angle),
                          }),
                      ),
                  };

        case 'text':
            return {
                ...shape,
                at: move(shape.at),
                height: shape.height * Math.abs(at.scaleY),
                rotation: shape.rotation + at.rotation,
            };
    }
}

/** An inner placement seen through an outer one. */
function compose(outer: Placement, inner: Placement): Placement {
    if (outer === IDENTITY) {
        return inner;
    }

    const cos = Math.cos(outer.rotation);
    const sin = Math.sin(outer.rotation);
    const x = inner.x * outer.scaleX;
    const y = inner.y * outer.scaleY;

    return {
        x: outer.x + x * cos - y * sin,
        y: outer.y + x * sin + y * cos,
        scaleX: outer.scaleX * inner.scaleX,
        scaleY: outer.scaleY * inner.scaleY,
        rotation: outer.rotation + inner.rotation,
    };
}

function turn(segments: number): number[] {
    return Array.from({ length: segments }, (_, step) => (step / segments) * TAU);
}

function lwPolyline(record: Entity): DxfShape | null {
    const points: Point[] = [];
    const bulges: number[] = [];
    let x: number | null = null;

    for (const [code, value] of record.groups) {
        if (code === 10) {
            x = Number(value);
        } else if (code === 20 && x !== null) {
            points.push({ x, y: Number(value) });
            bulges.push(0);
            x = null;
        } else if (code === 42 && bulges.length > 0) {
            bulges[bulges.length - 1] = Number(value);
        }
    }

    const closed = (number(record.groups, 70, 0) & 1) === 1;

    return points.length < 2
        ? null
        : {
              kind: 'polyline',
              layer: layerOf(record),
              points: withBulges(points, bulges, closed),
              closed,
          };
}

function oldPolyline(record: Entity, vertices: Entity[]): DxfShape | null {
    const points = vertices.map((vertex) => ({
        x: number(vertex.groups, 10, 0),
        y: number(vertex.groups, 20, 0),
    }));

    const bulges = vertices.map((vertex) => number(vertex.groups, 42, 0));
    const closed = (number(record.groups, 70, 0) & 1) === 1;

    return points.length < 2
        ? null
        : {
              kind: 'polyline',
              layer: layerOf(record),
              points: withBulges(points, bulges, closed),
              closed,
          };
}

/**
 * A polyline's rounded corners.
 *
 * A vertex carries a bulge: the tangent of a quarter of the angle the arc to the next vertex
 * subtends. Ignoring it is what turns a curved wall into the chord across it, so each bulged
 * span is replaced by the arc it describes.
 */
function withBulges(points: Point[], bulges: number[], closed: boolean): Point[] {
    if (bulges.every((bulge) => bulge === 0)) {
        return points;
    }

    const out: Point[] = [];
    const last = closed ? points.length : points.length - 1;

    for (let at = 0; at < last; at++) {
        const from = points[at]!;
        const to = points[(at + 1) % points.length]!;
        const bulge = bulges[at] ?? 0;

        out.push(from);

        if (bulge === 0) continue;

        const sweep = 4 * Math.atan(bulge);
        const offset = (1 / bulge - bulge) / 2;
        const centre = {
            x: (from.x + to.x) / 2 + (offset * (from.y - to.y)) / 2,
            y: (from.y + to.y) / 2 + (offset * (to.x - from.x)) / 2,
        };

        const radius = distance(centre, from);
        const start = Math.atan2(from.y - centre.y, from.x - centre.x);
        const steps = Math.max(2, Math.round((Math.abs(sweep) / TAU) * CURVE_SEGMENTS));

        for (let step = 1; step < steps; step++) {
            const angle = start + (sweep * step) / steps;

            out.push({
                x: centre.x + radius * Math.cos(angle),
                y: centre.y + radius * Math.sin(angle),
            });
        }
    }

    if (!closed) {
        out.push(points[points.length - 1]!);
    }

    return out;
}

function arc(record: Entity): DxfShape | null {
    const centre = { x: number(record.groups, 10, 0), y: number(record.groups, 20, 0) };
    const radius = number(record.groups, 40, 0);
    const start = (number(record.groups, 50, 0) * TAU) / 360;
    const end = (number(record.groups, 51, 0) * TAU) / 360;

    if (radius <= 0) {
        return null;
    }

    // A DXF arc always runs anticlockwise from its start, however the two ends are ordered.
    const sweep = (((end - start) % TAU) + TAU) % TAU;
    const steps = Math.max(2, Math.round((sweep / TAU) * CURVE_SEGMENTS));

    return {
        kind: 'polyline',
        layer: layerOf(record),
        closed: false,
        points: Array.from({ length: steps + 1 }, (_, step) => {
            const angle = start + (sweep * step) / steps;

            return {
                x: centre.x + radius * Math.cos(angle),
                y: centre.y + radius * Math.sin(angle),
            };
        }),
    };
}

function ellipse(record: Entity): DxfShape | null {
    const centre = { x: number(record.groups, 10, 0), y: number(record.groups, 20, 0) };
    // The major axis is given as a vector from the centre, and the minor one as a ratio of it.
    const major = { x: number(record.groups, 11, 0), y: number(record.groups, 21, 0) };
    const ratio = number(record.groups, 40, 1);
    const start = number(record.groups, 41, 0);
    const end = number(record.groups, 42, TAU);

    const rx = Math.hypot(major.x, major.y);

    if (rx <= 0) {
        return null;
    }

    const ry = rx * ratio;
    const tilt = Math.atan2(major.y, major.x);
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const sweep = end - start;
    const steps = Math.max(2, Math.round((Math.abs(sweep) / TAU) * CURVE_SEGMENTS));
    const whole = Math.abs(Math.abs(sweep) - TAU) < 1e-6;

    return {
        kind: 'polyline',
        layer: layerOf(record),
        closed: whole,
        points: Array.from({ length: whole ? steps : steps + 1 }, (_, step) => {
            const angle = start + (sweep * step) / steps;
            const x = rx * Math.cos(angle);
            const y = ry * Math.sin(angle);

            return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
        }),
    };
}

/** A filled quadrilateral, as its outline. Its third and fourth corners are given crosswise. */
function solid(record: Entity): DxfShape | null {
    const corners = [
        [10, 20],
        [11, 21],
        [13, 23],
        [12, 22],
    ].flatMap(([x, y]): Point[] => {
        const at = first(record.groups, x ?? 0);

        return at === undefined ? [] : [{ x: Number(at), y: number(record.groups, y ?? 0, 0) }];
    });

    const points = corners.filter(
        (corner, at) => at === 0 || distance(corner, corners[at - 1]!) > 1e-9,
    );

    return points.length < 3
        ? null
        : { kind: 'polyline', layer: layerOf(record), points, closed: true };
}

function text(record: Entity): DxfShape | null {
    const content = (first(record.groups, 1) ?? '').trim();

    if (content === '') {
        return null;
    }

    const justify = number(record.groups, 72, 0);
    const align: TextAlign = justify === 1 ? 'center' : justify === 2 ? 'right' : 'left';

    // Anything but left-justified is placed by its alignment point rather than by 10/20.
    const anchor =
        justify === 0
            ? { x: number(record.groups, 10, 0), y: number(record.groups, 20, 0) }
            : {
                  x: number(record.groups, 11, number(record.groups, 10, 0)),
                  y: number(record.groups, 21, number(record.groups, 20, 0)),
              };

    return {
        kind: 'text',
        layer: layerOf(record),
        at: anchor,
        content: plainText(content),
        height: number(record.groups, 40, 2.5),
        rotation: (number(record.groups, 50, 0) * TAU) / 360,
        align,
    };
}

/**
 * A paragraph of formatted text, as the one line this drawing can hold.
 *
 * An `MTEXT` is placed by a corner of its box rather than by a baseline, so the anchor is
 * nudged by the height for the rows that hang below their point. That is an approximation of
 * a paragraph by its first line, which is what turning many lines into one has to be.
 */
function mtext(record: Entity): DxfShape | null {
    const content = plainText(
        record.groups
            .filter(([code]) => code === 1 || code === 3)
            .map(([, value]) => value)
            .join(''),
    );

    if (content === '') {
        return null;
    }

    const attachment = number(record.groups, 71, 1);
    const height = number(record.groups, 40, 2.5);
    const column = (attachment - 1) % 3;

    return {
        kind: 'text',
        layer: layerOf(record),
        at: {
            x: number(record.groups, 10, 0),
            y:
                number(record.groups, 20, 0) -
                (attachment <= 3 ? height : attachment <= 6 ? height / 2 : 0),
        },
        content,
        height,
        rotation: (number(record.groups, 50, 0) * TAU) / 360,
        align: column === 1 ? 'center' : column === 2 ? 'right' : 'left',
    };
}

/**
 * A spline, when it was written down as points somebody chose.
 *
 * A spline's control points are not on the curve, so joining them draws something that is
 * visibly not the shape in the file — a survey boundary in the wrong place. Its fit points
 * are on it, and when they are there the spline is the run through them. When they are not,
 * it is left out and counted, which is more use than a wrong line.
 */
function spline(record: Entity): DxfShape | null {
    const points: Point[] = [];
    let x: number | null = null;

    for (const [code, value] of record.groups) {
        if (code === 11) {
            x = Number(value);
        } else if (code === 21 && x !== null) {
            points.push({ x, y: Number(value) });
            x = null;
        }
    }

    return points.length < 2
        ? null
        : {
              kind: 'polyline',
              layer: layerOf(record),
              points,
              closed: (number(record.groups, 70, 0) & 1) === 1,
          };
}

/** Formatting codes out, so what arrives is the words rather than the mark-up around them. */
function plainText(raw: string): string {
    return raw
        .replace(/\\P/g, ' ')
        .replace(/\\[A-Za-z][^;]*;/g, '')
        .replace(/[{}]/g, '')
        .replace(/%%[dcp]/g, (code) => (code === '%%d' ? '°' : code === '%%c' ? 'Ø' : '±'))
        .replace(/\s+/g, ' ')
        .trim();
}

export interface DxfElementOptions {
    /** Millimetres per unit of the file. */
    unitScale: number;
    /** The document layer each DXF layer lands on. A layer left out is a layer left behind. */
    layers: Map<string, string>;
}

/**
 * The shapes as elements: in millimetres, and the right way up.
 *
 * The two changes of frame happen here and nowhere else. Lengths take the unit the file was
 * read in, and y is negated, because a DXF grows upward and a drawing here grows downward —
 * the same mirror the export writes, run backwards. Angles negate with it.
 *
 * Coordinates are otherwise the file's own. A survey drawn on a national grid arrives on that
 * grid rather than being slid to the origin: where a drawing is can be the most important
 * thing about it, and two files imported separately have to land on top of each other.
 */
export function dxfElements(shapes: readonly DxfShape[], options: DxfElementOptions): Element[] {
    const at = (p: Point): Point => ({ x: p.x * options.unitScale, y: -p.y * options.unitScale });

    return shapes.flatMap((shape): Element[] => {
        const layerId = options.layers.get(shape.layer);

        if (layerId === undefined) {
            return [];
        }

        switch (shape.kind) {
            case 'polyline': {
                const points = shape.points.map(at);

                // Two points and no closing edge is a line, which is a thing you can take hold
                // of an end of and give a length to.
                if (points.length === 2 && !shape.closed) {
                    return [createLine(points[0]!, points[1]!, layerId)];
                }

                const polygon = createPolygon(points, shape.closed, layerId);

                return polygon === null ? [] : [polygon];
            }

            case 'circle': {
                const radius = shape.radius * options.unitScale;

                return radius > 0 ? [createCircle(at(shape.centre), radius, layerId)] : [];
            }

            case 'text': {
                const element = createText(shape.content, at(shape.at), layerId);

                return [
                    {
                        ...element,
                        transform: { ...element.transform, rotation: -shape.rotation },
                        geometry: {
                            ...element.geometry,
                            fontSize: Math.max(shape.height * options.unitScale, 1),
                            align: shape.align,
                        },
                    },
                ];
            }
        }
    });
}
