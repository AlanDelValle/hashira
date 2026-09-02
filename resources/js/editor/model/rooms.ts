import { signedPolygonArea, pointInPolygon } from '@/editor/geometry/polygon';
import {
    closestPointOnSegment,
    intersectLines,
    parameterAlongSegment,
    type Segment,
} from '@/editor/geometry/segment';
import {
    add,
    angleOf,
    distance,
    normalize,
    perpendicular,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';

import { wallSegment } from './elements';
import type { HashiraDocument, WallElement } from './types';

/**
 * Finding the room somebody clicked in.
 *
 * A room is not drawn, it is *found*: the walls around a space already say where it is, and
 * asking someone to trace a boundary that is sitting right there in the drawing is asking
 * them to copy it by hand and get it slightly wrong. Click inside four walls and the ring
 * that comes back runs along their inside faces.
 *
 * The walls are turned into a planar graph — every centreline cut at every crossing — and the
 * face containing the point is walked out of it. Then each edge of that face is moved in by
 * half the thickness of the wall it came from, so the room is the space, not the centrelines
 * around it.
 */

/** Points closer together than this are the same node, in millimetres. */
const TOLERANCE = 0.5;

/** A ring of more edges than this is a runaway rather than a room. */
const MAX_EDGES = 4096;

interface Node {
    at: Point;
    /** Outgoing half-edges, sorted by the direction they leave in. */
    out: number[];
}

interface HalfEdge {
    from: number;
    to: number;
    /** Half the thickness of the wall this came from. */
    half: number;
}

export interface WallGraph {
    nodes: Node[];
    /** Half-edges in pairs: `edge ^ 1` is the same edge walked the other way. */
    edges: HalfEdge[];
}

const graphs = new WeakMap<HashiraDocument, WallGraph>();

/**
 * The walls of a drawing as a planar graph, worked out once per version of it.
 *
 * A document is immutable, so this cannot go stale — the same reasoning `documentIndex` runs
 * on. It matters here because the room under the pointer is worked out on every pointer move
 * while the room tool is armed, and cutting every wall against every other one is not
 * something to do sixty times a second.
 */
export function wallGraph(drawing: HashiraDocument): WallGraph {
    const existing = graphs.get(drawing);

    if (existing !== undefined) {
        return existing;
    }

    const hidden = new Set(
        drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
    );

    const walls = drawing.elements.filter(
        (element): element is WallElement =>
            element.type === 'wall' && !hidden.has(element.layerId),
    );

    const created = build(walls);
    graphs.set(drawing, created);

    return created;
}

function build(walls: readonly WallElement[]): WallGraph {
    const segments = walls
        .map((wall) => ({ ...wallSegment(wall), half: wall.geometry.thickness / 2 }))
        .filter((segment) => distance(segment.a, segment.b) > TOLERANCE);

    const nodes: Node[] = [];
    const byKey = new Map<string, number>();

    const nodeAt = (p: Point): number => {
        // Bucketed by the tolerance, and the eight neighbouring buckets are checked too, so
        // two points either side of a bucket edge still land on the one node.
        const cx = Math.round(p.x / TOLERANCE);
        const cy = Math.round(p.y / TOLERANCE);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const found = byKey.get(`${cx + dx}:${cy + dy}`);

                if (found !== undefined && distance(nodes[found]?.at ?? p, p) <= TOLERANCE) {
                    return found;
                }
            }
        }

        const index = nodes.length;
        nodes.push({ at: p, out: [] });
        byKey.set(`${cx}:${cy}`, index);

        return index;
    };

    const edges: HalfEdge[] = [];
    const seen = new Set<string>();

    const connect = (from: number, to: number, half: number): void => {
        if (from === to) return;

        const key = from < to ? `${from}-${to}` : `${to}-${from}`;

        // A wall drawn twice, or two walls sharing a stretch, is still one edge: a doubled
        // edge would give the face walk somewhere to go that is not a boundary.
        if (seen.has(key)) return;

        seen.add(key);

        const first = edges.length;
        edges.push({ from, to, half }, { from: to, to: from, half });
        nodes[from]?.out.push(first);
        nodes[to]?.out.push(first + 1);
    };

    for (const segment of segments) {
        const cuts = [0, 1, ...crossings(segment, segments)];

        cuts.sort((one, other) => one - other);

        let previous = nodeAt(segment.a);

        for (const t of cuts) {
            const at = add(segment.a, scale(subtract(segment.b, segment.a), t));
            const node = nodeAt(at);

            connect(previous, node, segment.half);
            previous = node;
        }
    }

    for (const node of nodes) {
        node.out.sort(
            (one, other) => direction(nodes, edges, one) - direction(nodes, edges, other),
        );
    }

    prune(nodes, edges);

    return { nodes, edges };
}

/** Where along `segment` the other walls cut it, as parameters from 0 to 1. */
function crossings(
    segment: Segment & { half: number },
    others: readonly (Segment & { half: number })[],
): number[] {
    const found: number[] = [];
    const length = distance(segment.a, segment.b);

    for (const other of others) {
        if (other === segment) continue;

        const crossing = intersectLines(
            segment.a,
            normalize(subtract(segment.b, segment.a)),
            other.a,
            normalize(subtract(other.b, other.a)),
            1e-9,
        );

        // The lines have to cross on both of the actual segments, allowing for an end that
        // stops a hair short of the other wall — which is how a T gets drawn by hand.
        const candidates =
            crossing === null
                ? [closestPointOnSegment(segment, other.a), closestPointOnSegment(segment, other.b)]
                : [crossing];

        for (const at of candidates) {
            if (distance(at, closestPointOnSegment(other, at)) > TOLERANCE) continue;

            const t = parameterAlongSegment(segment, at);

            if (t * length > TOLERANCE && (1 - t) * length > TOLERANCE) {
                found.push(t);
            }
        }
    }

    return found;
}

function direction(nodes: readonly Node[], edges: readonly HalfEdge[], edge: number): number {
    const half = edges[edge];
    const from = nodes[half?.from ?? 0]?.at;
    const to = nodes[half?.to ?? 0]?.at;

    return from === undefined || to === undefined ? 0 : angleOf(subtract(to, from));
}

/**
 * Drop every dead end, over and over until none is left.
 *
 * A wall with a free end does not enclose anything, and leaving it in gives the face walk a
 * spur to go up and come back down — a zero-width spike in the middle of a room. A stub
 * sticking into a space is not part of that space's boundary, which is exactly what removing
 * it says.
 */
function prune(nodes: Node[], edges: readonly HalfEdge[]): void {
    let removed = true;

    while (removed) {
        removed = false;

        for (const [index, node] of nodes.entries()) {
            if (node.out.length !== 1) continue;

            const only = node.out[0];

            if (only === undefined) continue;

            const far = edges[only]?.to;
            const back = only ^ 1;

            node.out = [];

            if (far !== undefined && far !== index) {
                const neighbour = nodes[far];

                if (neighbour !== undefined) {
                    neighbour.out = neighbour.out.filter((edge) => edge !== back);
                }
            }

            removed = true;
        }
    }
}

/**
 * The face to the left of a half-edge, as the ring of half-edges around it.
 *
 * At each node the walk takes the neighbour just before the way it came in, which is the
 * sharpest available turn and therefore keeps to the same face all the way round.
 */
function traceFace(graph: WallGraph, start: number): number[] {
    const ring: number[] = [];
    let current = start;

    do {
        ring.push(current);

        const arrivedAt = graph.edges[current]?.to;
        const out = arrivedAt === undefined ? undefined : graph.nodes[arrivedAt]?.out;

        if (out === undefined || out.length === 0) return [];

        const back = out.indexOf(current ^ 1);

        if (back === -1) return [];

        current = out[(back - 1 + out.length) % out.length] ?? start;
    } while (current !== start && ring.length < MAX_EDGES);

    return current === start ? ring : [];
}

/** The world points a ring of half-edges passes through. */
function ringPoints(graph: WallGraph, ring: readonly number[]): Point[] {
    return ring.flatMap((edge): Point[] => {
        const at = graph.nodes[graph.edges[edge]?.from ?? -1]?.at;

        return at === undefined ? [] : [at];
    });
}

/**
 * The centrelines around the space containing `at`, or null when nothing encloses it.
 *
 * The nearest edge to the right of the point is on that space's boundary, so the face is one
 * of the two that edge separates. A bounded face winds one way and the outside of the drawing
 * winds the other, which is what tells them apart — the point is inside both of their rings.
 */
function faceAround(graph: WallGraph, at: Point): number[] | null {
    let nearest: number | null = null;
    let nearestX = Infinity;

    for (const [index, edge] of graph.edges.entries()) {
        if (index % 2 === 1) continue;

        const from = graph.nodes[edge.from]?.at;
        const to = graph.nodes[edge.to]?.at;

        if (from === undefined || to === undefined) continue;
        if (from.y > at.y === to.y > at.y) continue;

        const x = from.x + ((at.y - from.y) / (to.y - from.y)) * (to.x - from.x);

        if (x >= at.x && x < nearestX) {
            nearest = index;
            nearestX = x;
        }
    }

    if (nearest === null) {
        return null;
    }

    for (const candidate of [nearest, nearest ^ 1]) {
        const ring = traceFace(graph, candidate);
        const points = ringPoints(graph, ring);

        // A face that is enclosed winds clockwise in screen space; the one outside everything
        // is the same boundary walked the other way.
        if (points.length >= 3 && signedPolygonArea(points) > 0 && pointInPolygon(points, at)) {
            return ring;
        }
    }

    return null;
}

/**
 * The room around a point: the inside faces of the walls that enclose it.
 *
 * Each edge of the face is moved in by half the thickness of its own wall, and consecutive
 * edges are met at the crossing of those two inset lines — so a corner between a 250 mm
 * external wall and a 100 mm partition lands where the two inside faces actually meet rather
 * than at either of their centrelines.
 */
export function roomAround(drawing: HashiraDocument, at: Point): Point[] | null {
    const graph = wallGraph(drawing);
    const ring = faceAround(graph, at);

    if (ring === null) {
        return null;
    }

    const lines = ring.flatMap((edge): { at: Point; along: Point }[] => {
        const half = graph.edges[edge];
        const from = graph.nodes[half?.from ?? -1]?.at;
        const to = graph.nodes[half?.to ?? -1]?.at;

        if (half === undefined || from === undefined || to === undefined) return [];

        const along = normalize(subtract(to, from));

        // The walk keeps the face on its right, so that is the side the room is on.
        const inward = scale(perpendicular(along), half.half);

        return [{ at: add(from, inward), along }];
    });

    const corners: Point[] = [];

    for (const [index, line] of lines.entries()) {
        const previous = lines[(index - 1 + lines.length) % lines.length];

        if (previous === undefined) continue;

        const corner = intersectLines(previous.at, previous.along, line.at, line.along, 1e-6);

        // Two edges in line with one another have no crossing to speak of. If they are walls
        // of the same thickness the inset lines are the same line and the corner is simply
        // where one hands over to the other; if they are not, the step between them is real
        // and both of its ends belong to the room.
        corners.push(corner ?? line.at);
    }

    const simplified = corners.filter((corner, index) => {
        const previous = corners[(index - 1 + corners.length) % corners.length];

        return previous === undefined || distance(previous, corner) > TOLERANCE;
    });

    return simplified.length >= 3 ? simplified : null;
}

/**
 * Whether a point stands in a space the walls close in.
 *
 * The same question `roomAround` asks and then answers with a boundary; this one only wants
 * the yes or no. It is what tells the inside of a wall from its outside — a wall has no
 * opinion about which of its faces is which, and the order it happened to be drawn in is not
 * an answer. What encloses the space is.
 */
export function enclosedAt(drawing: HashiraDocument, at: Point): boolean {
    return faceAround(wallGraph(drawing), at) !== null;
}
