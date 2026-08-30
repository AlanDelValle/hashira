import { boundsIntersect, type Bounds } from '@/editor/geometry/bbox';
import type { Segment } from '@/editor/geometry/segment';
import { midpoint, type Point } from '@/editor/geometry/vec';
import { elementBounds, elementWorldPoints, makeLookup } from '@/editor/model/elements';
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

function segmentsOf(element: Element, lookup: ReturnType<typeof makeLookup>): Segment[] {
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

export function gatherNear(
    drawing: HashiraDocument,
    search: Bounds,
    exclude: ReadonlySet<string>,
): Neighbourhood {
    const lookup = makeLookup(drawing.elements);
    const hidden = new Set(
        drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
    );

    const segments: Segment[] = [];
    const endpoints: Point[] = [];

    for (const element of drawing.elements) {
        if (exclude.has(element.id) || hidden.has(element.layerId)) continue;

        const bounds = elementBounds(element, lookup);

        if (bounds === null || !boundsIntersect(bounds, search)) continue;

        // A circle has no vertices; its centre is the point worth catching.
        if (element.type === 'circle') {
            endpoints.push({ x: element.transform.x, y: element.transform.y });
            continue;
        }

        const elementSegments = segmentsOf(element, lookup);
        segments.push(...elementSegments);
        endpoints.push(...elementWorldPoints(element, lookup));
    }

    return {
        segments,
        endpoints,
        midpoints: segments.map((segment) => midpoint(segment.a, segment.b)),
    };
}
