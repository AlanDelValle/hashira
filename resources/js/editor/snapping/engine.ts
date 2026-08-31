import { expandBounds, type Bounds } from '@/editor/geometry/bbox';
import { intersectSegments } from '@/editor/geometry/segment';
import { distance, type Point } from '@/editor/geometry/vec';
import type { HashiraDocument, SnapSettings } from '@/editor/model/types';

import { gatherNear } from './candidates';

/**
 * One place decides where the pointer actually lands.
 *
 * Tools never look at the grid, or at other elements, or at the zoom level. They ask for a
 * point and get one back together with the reason it moved, so the renderer can say *why* it
 * snapped — an endpoint marker and a grid dot mean different things to a drafter.
 *
 * Tolerance is given in screen pixels and converted here, so snapping feels identical whether
 * you are looking at a whole floor or at one door jamb.
 */

export type SnapKind =
    'grid' | 'endpoint' | 'midpoint' | 'intersection' | 'horizontal' | 'vertical';

export interface SnapResult {
    point: Point;
    /** Null when nothing caught it and the raw pointer position stands. */
    kind: SnapKind | null;
    /** The point an alignment was measured from, for drawing the guide. */
    reference?: Point;
}

export interface SnapOptions {
    drawing: HashiraDocument;
    /** Snap settings from the document. */
    settings: SnapSettings;
    /** The editor's grid toggle, which overrides the document's for the session. */
    gridSnapEnabled: boolean;
    gridSize: number;
    /** Tolerance in world millimetres, already converted from screen pixels. */
    tolerance: number;
    /** Elements to ignore — a shape being dragged must not snap to itself. */
    exclude?: ReadonlySet<string>;
    /** Points the active tool has already placed, which alignment guides run from. */
    anchors?: readonly Point[];
}

const NO_EXCLUSIONS: ReadonlySet<string> = new Set();

/**
 * Priority order. An endpoint is a stronger intent than a midpoint, which is stronger than a
 * crossing, and all of them beat the grid — landing exactly on the corner of an existing wall
 * matters more than landing on a round number.
 */
const PRIORITY: SnapKind[] = [
    'endpoint',
    'midpoint',
    'intersection',
    'horizontal',
    'vertical',
    'grid',
];

interface Candidate {
    point: Point;
    kind: SnapKind;
    distance: number;
    reference?: Point;
}

export function snapPoint(raw: Point, options: SnapOptions): SnapResult {
    const { settings, tolerance } = options;

    if (!settings.enabled) {
        return { point: raw, kind: null };
    }

    const exclude = options.exclude ?? NO_EXCLUSIONS;
    const search: Bounds = expandBounds(
        { minX: raw.x, minY: raw.y, maxX: raw.x, maxY: raw.y },
        tolerance,
    );

    const near = gatherNear(options.drawing, search, exclude);
    const candidates: Candidate[] = [];

    if (settings.endpoint) {
        collect(candidates, near.endpoints, raw, tolerance, 'endpoint');
    }

    if (settings.midpoint) {
        collect(candidates, near.midpoints, raw, tolerance, 'midpoint');
    }

    if (settings.intersection) {
        collect(candidates, intersectionsNear(near.segments), raw, tolerance, 'intersection');
    }

    const grid = options.gridSnapEnabled && options.gridSize > 0 ? options.gridSize : 0;

    if (settings.axis) {
        candidates.push(...alignments(raw, options, near.endpoints, tolerance, grid));
    }

    if (grid > 0) {
        const onGrid = { x: toGrid(raw.x, grid), y: toGrid(raw.y, grid) };

        // The grid always applies; it has the lowest priority rather than a tolerance, so
        // there is never a dead zone between two grid lines where nothing snaps.
        candidates.push({ point: onGrid, kind: 'grid', distance: distance(raw, onGrid) });
    }

    return best(candidates) ?? { point: raw, kind: null };
}

function collect(
    into: Candidate[],
    points: readonly Point[],
    raw: Point,
    tolerance: number,
    kind: SnapKind,
): void {
    for (const point of points) {
        const d = distance(raw, point);

        if (d <= tolerance) {
            into.push({ point, kind, distance: d });
        }
    }
}

/** Crossings between the nearby segments. The set is small, so the pairwise loop is cheap. */
function intersectionsNear(segments: readonly { a: Point; b: Point }[]): Point[] {
    const points: Point[] = [];

    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const first = segments[i];
            const second = segments[j];

            if (first === undefined || second === undefined) continue;

            const crossing = intersectSegments(first, second);

            if (crossing !== null) {
                points.push(crossing);
            }
        }
    }

    return points;
}

function toGrid(value: number, grid: number): number {
    return grid > 0 ? Math.round(value / grid) * grid : value;
}

/**
 * Alignment with something already on the drawing: holding the same X or the same Y as a
 * point the tool has placed, or as a nearby endpoint.
 *
 * Only the matching coordinate is locked by the alignment itself. The other still lands on
 * the grid, because the grid always applies — an alignment says *this* coordinate is not
 * yours to choose, not that the rest of the point stopped being drafted. Without that, a wall
 * dragged along a guide came out a fraction of a grid step long in the one direction anybody
 * would expect to be exact, while the same wall dragged diagonally landed on the grid in both.
 */
function alignments(
    raw: Point,
    options: SnapOptions,
    endpoints: readonly Point[],
    tolerance: number,
    grid: number,
): Candidate[] {
    const references = [...(options.anchors ?? []), ...endpoints];
    const candidates: Candidate[] = [];

    for (const reference of references) {
        const dx = Math.abs(raw.x - reference.x);
        const dy = Math.abs(raw.y - reference.y);

        if (dx <= tolerance) {
            candidates.push({
                point: { x: reference.x, y: toGrid(raw.y, grid) },
                kind: 'vertical',
                distance: dx,
                reference,
            });
        }

        if (dy <= tolerance) {
            candidates.push({
                point: { x: toGrid(raw.x, grid), y: reference.y },
                kind: 'horizontal',
                distance: dy,
                reference,
            });
        }
    }

    return candidates;
}

function best(candidates: readonly Candidate[]): SnapResult | null {
    let winner: Candidate | null = null;

    for (const candidate of candidates) {
        if (winner === null) {
            winner = candidate;
            continue;
        }

        const byPriority = PRIORITY.indexOf(candidate.kind) - PRIORITY.indexOf(winner.kind);

        // Same kind: the nearer one. Different kinds: the stronger intent, however far.
        if (byPriority < 0 || (byPriority === 0 && candidate.distance < winner.distance)) {
            winner = candidate;
        }
    }

    if (winner === null) {
        return null;
    }

    return winner.reference === undefined
        ? { point: winner.point, kind: winner.kind }
        : { point: winner.point, kind: winner.kind, reference: winner.reference };
}
