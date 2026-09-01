import { boundsIntersect, unionBounds, type Bounds } from '@/editor/geometry/bbox';

import { elementBounds, type ElementLookup } from './elements';
import type { Element, HashiraDocument } from './types';

/**
 * What is where, worked out once per version of the document.
 *
 * Picking, snapping and painting all used to answer that question from scratch: each of them
 * built its own id map, recomputed every element's bounds and walked the whole drawing —
 * three times per pointer move, sixty times a second during a drag. On a small plan that is
 * invisible. On a several-hundred-element one it is the difference between a drag that tracks
 * the pointer and one that trails behind it.
 *
 * Nothing here is a cache in the risky sense. A document is immutable: every command produces
 * a new one, so an index belongs to exactly one version of the drawing and cannot go stale.
 * The index for a version that has been superseded is collected with it.
 */

/** Grid cell, in millimetres — two metres, so a snap search touches one or two cells. */
const CELL_MM = 2000;

/**
 * An element spanning more than this many cells is held aside rather than written into all
 * of them. A site boundary across a whole drawing would otherwise cost thousands of inserts
 * to save one comparison later.
 */
const MAX_CELLS = 64;

export interface DocumentIndex {
    lookup: ElementLookup;
    /** The element's world bounds, computed at most once. */
    bounds: (element: Element) => Bounds | null;
    /**
     * Every element whose bounds meet `area`, in document order — and only those. The grid
     * narrows the search to a few cells; the answer is then exact, so callers can use it
     * directly instead of re-testing what comes back.
     */
    near: (area: Bounds) => Element[];
    /**
     * Reordered topmost first — later layers above earlier ones, and within a layer, later
     * elements above earlier ones. That is the order a pick has to consider them in.
     */
    sortTopDown: (elements: readonly Element[]) => Element[];
    /**
     * Everything in the drawing, as one rectangle, or null when there is nothing in it.
     *
     * Worked out at most once per version of the document, because a sheet that frames the
     * whole drawing needs it on every frame it is painted on: doing it the direct way would
     * walk the entire plan sixty times a second to draw one rectangle.
     */
    extent: () => Bounds | null;
}

const indexes = new WeakMap<HashiraDocument, DocumentIndex>();

export function documentIndex(drawing: HashiraDocument): DocumentIndex {
    const existing = indexes.get(drawing);

    if (existing !== undefined) {
        return existing;
    }

    const created = build(drawing);
    indexes.set(drawing, created);

    return created;
}

function build(drawing: HashiraDocument): DocumentIndex {
    const byId = new Map(drawing.elements.map((element) => [element.id, element]));
    const cached = new Map<string, Bounds | null>();

    const lookup: ElementLookup = (id) => byId.get(id);

    function bounds(element: Element): Bounds | null {
        // Only elements of this document are cached. A drag preview is a fresh object every
        // frame; caching those would grow a map for the length of the drag and never be read.
        if (byId.get(element.id) !== element) {
            return elementBounds(element, lookup);
        }

        const hit = cached.get(element.id);

        if (hit !== undefined || cached.has(element.id)) {
            return hit ?? null;
        }

        const computed = elementBounds(element, lookup);
        cached.set(element.id, computed);

        return computed;
    }

    const rank = new Map(drawing.layers.map((layer, at) => [layer.id, at]));
    const bottom = drawing.layers.length;
    const position = new Map(drawing.elements.map((element, at) => [element.id, at]));

    let cells: Map<string, Element[]> | null = null;
    const oversized: Element[] = [];
    const unbounded: Element[] = [];

    function grid(): Map<string, Element[]> {
        if (cells !== null) {
            return cells;
        }

        cells = new Map();

        for (const element of drawing.elements) {
            const area = bounds(element);

            // Something with no extent — an opening whose host has gone — cannot be placed
            // on the grid, and dropping it silently would make it unpickable.
            if (area === null) {
                unbounded.push(element);
                continue;
            }

            const minX = Math.floor(area.minX / CELL_MM);
            const minY = Math.floor(area.minY / CELL_MM);
            const maxX = Math.floor(area.maxX / CELL_MM);
            const maxY = Math.floor(area.maxY / CELL_MM);

            if ((maxX - minX + 1) * (maxY - minY + 1) > MAX_CELLS) {
                oversized.push(element);
                continue;
            }

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const key = `${x}:${y}`;
                    const bucket = cells.get(key);

                    if (bucket === undefined) {
                        cells.set(key, [element]);
                    } else {
                        bucket.push(element);
                    }
                }
            }
        }

        return cells;
    }

    function near(area: Bounds): Element[] {
        const buckets = grid();
        const found = new Set<Element>();

        const minX = Math.floor(area.minX / CELL_MM);
        const minY = Math.floor(area.minY / CELL_MM);
        const maxX = Math.floor(area.maxX / CELL_MM);
        const maxY = Math.floor(area.maxY / CELL_MM);

        // A cell is a net, not an answer: an element is in the cell because its bounds reach
        // the cell, which is not the same as reaching the query.
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (const element of buckets.get(`${x}:${y}`) ?? []) {
                    const elementArea = bounds(element);

                    if (elementArea !== null && boundsIntersect(elementArea, area)) {
                        found.add(element);
                    }
                }
            }
        }

        for (const element of oversized) {
            const elementArea = bounds(element);

            if (elementArea !== null && boundsIntersect(elementArea, area)) {
                found.add(element);
            }
        }

        for (const element of unbounded) {
            found.add(element);
        }

        // Document order is what decides what sits on top within a layer, so the result is
        // put back in it — by sorting the few that were found rather than by filtering the
        // whole drawing, which would make the query cost what it was meant to avoid.
        return [...found].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    }

    let extentBounds: Bounds | null = null;
    let extentDone = false;

    function extent(): Bounds | null {
        if (!extentDone) {
            for (const element of drawing.elements) {
                extentBounds = unionBounds(extentBounds, bounds(element));
            }

            extentDone = true;
        }

        return extentBounds;
    }

    function sortTopDown(elements: readonly Element[]): Element[] {
        return [...elements].sort((a, b) => {
            const byLayer = (rank.get(b.layerId) ?? bottom) - (rank.get(a.layerId) ?? bottom);

            return byLayer !== 0 ? byLayer : (position.get(b.id) ?? 0) - (position.get(a.id) ?? 0);
        });
    }

    return { lookup, bounds, near, sortTopDown, extent };
}
