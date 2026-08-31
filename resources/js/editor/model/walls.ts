import { intersectLines } from '@/editor/geometry/segment';
import {
    add,
    angleOf,
    clamp,
    distance,
    dot,
    normalize,
    perpendicular,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';

import { wallSegment } from './elements';
import type { Element, WallElement } from './types';

/**
 * Where walls meet.
 *
 * A wall is a band as wide as it is thick, and a band that simply stops at its centreline's
 * end leaves a square notch on the outside of every corner — the two thicknesses overlap on
 * the inside and neither reaches the outside. Drafting software cleans that up, and so does
 * this: each end of each wall is given the two parameters its band's corners actually sit at,
 * so the faces of the walls that meet there run into one another.
 *
 * Nothing here changes the document. A join is a fact about how walls are *drawn*, derived
 * from where they are, so moving one wall re-mitres its neighbours with no edit to them.
 */

/** Endpoints closer together than this are the same corner, in millimetres. */
const NODE_TOLERANCE = 1;

/** How far a mitre may run past the corner, in multiples of the wall's half-thickness. */
const MITRE_LIMIT = 8;

/** Millimetres to a cell in the grid used to find the wall a branch runs into. */
const CELL = 2000;

/**
 * The four corners of a wall's band, as distances along its centreline from the `a` end.
 * A wall that meets nothing has `0, 0, length, length`: a square band.
 *
 * "Left" is the side the centreline's perpendicular points to — the same convention the rest
 * of the geometry uses — and a parameter outside `0…length` means that corner runs past the
 * end of the centreline, which is what a mitre is.
 */
export interface WallBand {
    startLeft: number;
    startRight: number;
    endLeft: number;
    endRight: number;
}

export interface WallJoins {
    /** How each wall's band is cut, by wall id. */
    bands: ReadonlyMap<string, WallBand>;
    /**
     * The junctions between three or more walls, filed under every wall that meets at one.
     * A corner between two walls needs no such thing: their two bands already meet edge to
     * edge along the mitre.
     */
    patches: ReadonlyMap<string, Point[][]>;
}

/** The working copy `wallJoins` fills in. */
interface Joins {
    bands: Map<string, WallBand>;
    patches: Map<string, Point[][]>;
}

/** One end of one wall, seen from the point it lands on. */
interface WallEnd {
    id: string;
    /** True for the wall's `a` end. */
    start: boolean;
    at: Point;
    /** Unit vector from this point into the wall. */
    into: Point;
    half: number;
    length: number;
}

interface Straight {
    id: string;
    a: Point;
    b: Point;
    direction: Point;
    length: number;
    half: number;
}

function cellKey(x: number, y: number): string {
    return `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
}

function nodeKey(p: Point): string {
    return `${Math.round(p.x / NODE_TOLERANCE)}:${Math.round(p.y / NODE_TOLERANCE)}`;
}

/**
 * The band each wall is drawn as, once every corner has been mitred and every branch has been
 * run into the wall it stops against.
 *
 * Walls that are not in `elements` do not exist for this: building the scene for a selection
 * alone would otherwise mitre it against nothing and paint a shorter band over the drawing.
 */
export function wallJoins(elements: readonly Element[]): WallJoins {
    const straights: Straight[] = [];
    const joins: Joins = { bands: new Map(), patches: new Map() };
    const bands = joins.bands;

    for (const element of elements) {
        if (element.type !== 'wall') continue;

        const { a, b } = wallSegment(element);
        const length = distance(a, b);

        if (length === 0) continue;

        straights.push({
            id: element.id,
            a,
            b,
            direction: normalize(subtract(b, a)),
            length,
            half: element.geometry.thickness / 2,
        });

        bands.set(element.id, { startLeft: 0, startRight: 0, endLeft: length, endRight: length });
    }

    if (straights.length === 0) {
        return joins;
    }

    const nodes = new Map<string, WallEnd[]>();

    for (const wall of straights) {
        const { id, half, length } = wall;
        const ends: WallEnd[] = [
            { id, start: true, at: wall.a, into: wall.direction, half, length },
            { id, start: false, at: wall.b, into: scale(wall.direction, -1), half, length },
        ];

        for (const end of ends) {
            const key = nodeKey(end.at);
            const existing = nodes.get(key);

            if (existing === undefined) {
                nodes.set(key, [end]);
            } else {
                existing.push(end);
            }
        }
    }

    for (const meeting of nodes.values()) {
        if (meeting.length > 1) {
            mitre(meeting, joins);
        }
    }

    const grid = new Map<string, Straight[]>();

    for (const wall of straights) {
        for (const key of cellsCovered(wall)) {
            const existing = grid.get(key);

            if (existing === undefined) {
                grid.set(key, [wall]);
            } else {
                existing.push(wall);
            }
        }
    }

    for (const meeting of nodes.values()) {
        // A corner has already been resolved against the walls that share it. Only a loose
        // end can be a branch running into the middle of something.
        if (meeting.length > 1) continue;

        const end = meeting[0];

        if (end !== undefined) {
            runIntoWall(end, grid, bands);
        }
    }

    return joins;
}

/** Every wall registered in the cell around a point, and in the eight touching it. */
function near(grid: Map<string, Straight[]>, at: Point): Straight[] {
    const found: Straight[] = [];

    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            found.push(...(grid.get(cellKey(at.x + x * CELL, at.y + y * CELL)) ?? []));
        }
    }

    return found;
}

function* cellsCovered(wall: Straight): Iterable<string> {
    const minX = Math.min(wall.a.x, wall.b.x);
    const maxX = Math.max(wall.a.x, wall.b.x);
    const minY = Math.min(wall.a.y, wall.b.y);
    const maxY = Math.max(wall.a.y, wall.b.y);

    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
        for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y++) {
            yield `${x}:${y}`;
        }
    }
}

/**
 * Mitre every wall meeting at one point.
 *
 * Sorted by the direction they leave in, each neighbouring pair of walls bounds one wedge of
 * the corner, and the two faces looking into that wedge are what have to meet. That is the
 * same rule for a two-wall corner, a T and a crossroads, which is why nothing here counts how
 * many walls arrived.
 *
 * Two walls mitred this way share the sloped edge their bands now end on, so their union is
 * the corner and nothing is left over. Three or more do not: each band ends on an edge of the
 * small polygon between them, and that polygon is nobody's — hence the patch, which is the
 * junction itself and is what makes a T read as one piece of poché.
 */
function mitre(meeting: readonly WallEnd[], joins: Joins): void {
    const sorted = [...meeting].sort((first, second) => angleOf(first.into) - angleOf(second.into));

    // Where each band's two corners land, starting square and moved by each mitre that works.
    const plus = sorted.map((end) => corner(end, true, 0));
    const minus = sorted.map((end) => corner(end, false, 0));

    for (let i = 0; i < sorted.length; i++) {
        const one = sorted[i];
        const next = (i + 1) % sorted.length;
        const other = sorted[next];

        if (one === undefined || other === undefined || one === other) continue;

        // Angles grow towards the perpendicular, so the wedge between these two is bounded by
        // the face on one's positive side and the face on the other's negative side.
        const meetsAt = intersectLines(
            corner(one, true, 0),
            one.into,
            corner(other, false, 0),
            other.into,
            1e-6,
        );

        if (meetsAt === null) continue; // Collinear: the faces already line up.

        const onePlus = writeCorner(
            joins.bands,
            one,
            true,
            dot(subtract(meetsAt, one.at), one.into),
        );
        const otherMinus = writeCorner(
            joins.bands,
            other,
            false,
            dot(subtract(meetsAt, other.at), other.into),
        );

        plus[i] = corner(one, true, onePlus);
        minus[next] = corner(other, false, otherMinus);
    }

    if (sorted.length < 3) {
        return;
    }

    // Walking the ends in order, each contributes the two corners its band now ends on, and a
    // mitre that worked leaves the same point twice — once for each of the walls that meet
    // there. The ring is what is left when those coincidences are dropped.
    const ring: Point[] = [];

    for (let i = 0; i < sorted.length; i++) {
        for (const at of [minus[i], plus[i]]) {
            if (at === undefined) continue;

            const previous = ring[ring.length - 1] ?? ring[0];

            if (previous === undefined || distance(previous, at) > 1e-6) {
                ring.push(at);
            }
        }
    }

    const first = ring[0];
    const last = ring[ring.length - 1];

    if (
        ring.length > 1 &&
        first !== undefined &&
        last !== undefined &&
        distance(first, last) < 1e-6
    ) {
        ring.pop();
    }

    if (ring.length < 3) {
        return;
    }

    for (const end of sorted) {
        const existing = joins.patches.get(end.id);

        // Filed under every wall that meets there, so a scene built for one of them alone —
        // a hover, a selection — still draws the junction whole.
        if (existing === undefined) {
            joins.patches.set(end.id, [ring]);
        } else {
            existing.push(ring);
        }
    }
}

/** A band's corner, `reach` along the wall from the joint and half a thickness to one side. */
function corner(end: WallEnd, plus: boolean, reach: number): Point {
    const across = scale(perpendicular(end.into), plus ? end.half : -end.half);

    return add(add(end.at, scale(end.into, reach)), across);
}

/**
 * Record where one corner of one band sits, and answer with the reach actually used.
 *
 * `plus` says which face of the wall it belongs to as seen from the joint, which is its left
 * at the `a` end and its right at the `b` end: the perpendicular is taken from the direction
 * pointing into the wall, and that direction is reversed at the far end.
 */
function writeCorner(
    bands: Map<string, WallBand>,
    end: WallEnd,
    plus: boolean,
    reach: number,
): number {
    const band = bands.get(end.id);

    // A very shallow corner mitres to a spike metres long. Past a limit the band is cut off
    // square instead, which is what every stroke join in every renderer does and for the same
    // reason: a spike is further from the truth than a blunt end.
    const limited = clamp(reach, -end.half * MITRE_LIMIT, end.length);

    if (band === undefined) return limited;

    if (end.start) {
        if (plus) band.startLeft = limited;
        else band.startRight = limited;
    } else if (plus) {
        band.endRight = end.length - limited;
    } else {
        band.endLeft = end.length - limited;
    }

    return limited;
}

/**
 * A wall whose end stops against the side of another one — the stem of a T.
 *
 * The stem is carried on to the wall it meets so the two lots of poché merge. Whether it was
 * drawn to the other wall's face, to its centreline, or a little short of both, the drawing
 * shows one solid junction rather than a butt joint with a hairline in it.
 */
function runIntoWall(end: WallEnd, grid: Map<string, Straight[]>, bands: Map<string, WallBand>) {
    const reach = end.half + NODE_TOLERANCE;
    let best: number | null = null;

    for (const candidate of near(grid, end.at)) {
        if (candidate.id === end.id) continue;

        const allowance = candidate.half + reach;
        const crossing = intersectLines(end.at, end.into, candidate.a, candidate.direction, 1e-6);

        if (crossing === null) continue;

        // Behind the end, and no further behind it than the wall it is reaching for is thick.
        const back = dot(subtract(crossing, end.at), end.into);

        if (back > 0 || back < -allowance) continue;

        // And it has to be the side of that wall, not a point off the end of it.
        const along = dot(subtract(crossing, candidate.a), candidate.direction);

        if (along <= 0 || along >= candidate.length) continue;

        best = best === null ? back : Math.max(best, back);
    }

    if (best === null || best === 0) return;

    writeCorner(bands, end, true, best);
    writeCorner(bands, end, false, best);
}

/**
 * The four corners of a wall's band, in world millimetres, for the run of it between two
 * points along its centreline. `from` and `to` are distances from the `a` end.
 *
 * The mitred corners only belong to the ends of the wall: an opening cuts the band into runs,
 * and the square ends either side of a door are square whatever the corners are doing.
 */
export function wallBandCorners(
    wall: WallElement,
    band: WallBand | undefined,
    from: number,
    to: number,
): Point[] {
    const { a, b } = wallSegment(wall);
    const length = distance(a, b);

    if (length === 0) {
        return [];
    }

    const direction = normalize(subtract(b, a));
    const across = scale(perpendicular(direction), wall.geometry.thickness / 2);
    const at = (parameter: number, side: number): Point =>
        add(add(a, scale(direction, parameter)), scale(across, side));

    const startLeft = from === 0 ? (band?.startLeft ?? 0) : from;
    const startRight = from === 0 ? (band?.startRight ?? 0) : from;
    const endLeft = to === length ? (band?.endLeft ?? length) : to;
    const endRight = to === length ? (band?.endRight ?? length) : to;

    return [at(startLeft, 1), at(endLeft, 1), at(endRight, -1), at(startRight, -1)];
}
