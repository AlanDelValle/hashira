import type { Bounds } from '@/editor/geometry/bbox';
import type { Segment } from '@/editor/geometry/segment';
import { midpoint, type Point } from '@/editor/geometry/vec';
import { documentIndex } from '@/editor/model/documentIndex';
import { elementWorldPoints, type ElementLookup } from '@/editor/model/elements';
import type { Element, HashiraDocument } from '@/editor/model/types';

/**
 * What there is to snap to, near a point.
 *
 * Everything is gathered from a small neighbourhood rather than the whole drawing: at a
 * typical pick tolerance the search box is a few centimetres across, so a plan with thousands
 * of elements still only ever compares a handful.
 */

export interface Neighbourhood {
    /** World segments of the elements near the point. */
    segments: Segment[];
    /** Endpoints, corners and centres worth landing on exactly. */
    endpoints: Point[];
    /** The middle of each nearby segment. */
    midpoints: Point[];
}

function segmentsOf(element: Element, lookup: ElementLookup): Segment[] {
    switch (element.type) {
        case 'wall':
        case 'line': {
            const [a, b] = elementWorldPoints(element, lookup);

            return a === undefined || b === undefined ? [] : [{ a, b }];
        }

        case 'rect':
        case 'room':
        case 'asset':
            return ringSegments(elementWorldPoints(element, lookup), true);

        case 'polygon':
            return ringSegments(elementWorldPoints(element, lookup), element.geometry.closed);

        case 'door':
        case 'window':
            return ringSegments(elementWorldPoints(element, lookup), true);

        case 'circle':
        case 'text':
            return [];

        // The points a measurement is taken between are worth landing on; the lines it draws
        // around them are not — snapping to an annotation's own decoration would put new
        // geometry where the annotation happens to sit rather than where the plan is.
        case 'dimension':
        case 'angle':
        case 'radius':
        case 'leader':
        case 'cloud':
            return [];

        // A page being traced is a picture, not geometry. Snapping to its edges would land
        // new work on the paper rather than on the building drawn on it.
        case 'underlay':
            return [];
    }
}

function ringSegments(points: readonly Point[], closed: boolean): Segment[] {
    const segments: Segment[] = [];
    const last = closed ? points.length : points.length - 1;

    for (let i = 0; i < last; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        if (a !== undefined && b !== undefined) {
            segments.push({ a, b });
        }
    }

    return segments;
}

/**
 * Points worth lining up with, along the row and the column the pointer is standing in.
 *
 * This is a different question from "what is near the pointer", and it has to be, because an
 * alignment is about something that is *not* near: drawing a wall parallel to one across the
 * room means lining up with a corner several metres away. The bands are clipped to what is on
 * screen — a guide to something nobody can see is not a guide — so the search stays a walk
 * along one row and one column of the index rather than over the drawing.
 */
export function gatherAligned(
    drawing: HashiraDocument,
    bands: readonly Bounds[],
    exclude: ReadonlySet<string>,
): Point[] {
    const index = documentIndex(drawing);
    const hidden = new Set(
        drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
    );

    const points: Point[] = [];
    const seen = new Set<string>();

    for (const band of bands) {
        for (const element of index.near(band)) {
            if (exclude.has(element.id) || hidden.has(element.layerId) || seen.has(element.id)) {
                continue;
            }

            seen.add(element.id);

            if (element.type === 'circle') {
                points.push({ x: element.transform.x, y: element.transform.y });
                continue;
            }

            points.push(...elementWorldPoints(element, index.lookup));
        }
    }

    return points;
}

export function gatherNear(
    drawing: HashiraDocument,
    search: Bounds,
    exclude: ReadonlySet<string>,
): Neighbourhood {
    const index = documentIndex(drawing);
    const hidden = new Set(
        drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
    );

    const segments: Segment[] = [];
    const endpoints: Point[] = [];

    // The search box is a few centimetres across at a typical tolerance, so this asks the
    // index for the handful of elements that reach it rather than walking the drawing.
    for (const element of index.near(search)) {
        if (exclude.has(element.id) || hidden.has(element.layerId)) continue;

        // A circle has no vertices; its centre is the point worth catching.
        if (element.type === 'circle') {
            endpoints.push({ x: element.transform.x, y: element.transform.y });
            continue;
        }

        const elementSegments = segmentsOf(element, index.lookup);
        segments.push(...elementSegments);
        endpoints.push(...elementWorldPoints(element, index.lookup));
    }

    return {
        segments,
        endpoints,
        midpoints: segments.map((segment) => midpoint(segment.a, segment.b)),
    };
}
