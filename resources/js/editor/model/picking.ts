import { boundsContain, boundsIntersect, type Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';

import { elementBounds, hitTestElement, makeLookup } from './elements';
import type { Element, HashiraDocument } from './types';

/**
 * Choosing what the pointer is on.
 *
 * Layer order decides what is on top, and a hidden or locked layer is not there at all as far
 * as picking is concerned — you cannot select what you cannot see, and a lock means "leave
 * this alone" rather than "select it and then refuse to move it".
 */

export type MarqueeMode = 'window' | 'crossing';

function selectableLayers(drawing: HashiraDocument): Set<string> {
    return new Set(
        drawing.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id),
    );
}

/** Elements from topmost to bottom-most, which is the order a pick should consider them. */
function topDown(drawing: HashiraDocument): Element[] {
    const rank = new Map(drawing.layers.map((layer, index) => [layer.id, index]));
    const fallback = drawing.layers.length;

    return drawing.elements
        .map((element, index) => ({ element, index }))
        .sort((a, b) => {
            const byLayer =
                (rank.get(b.element.layerId) ?? fallback) -
                (rank.get(a.element.layerId) ?? fallback);

            return byLayer !== 0 ? byLayer : b.index - a.index;
        })
        .map((entry) => entry.element);
}

/** The topmost element under `p`, or null. `tolerance` is in world millimetres. */
export function pickAt(drawing: HashiraDocument, p: Point, tolerance: number): Element | null {
    const lookup = makeLookup(drawing.elements);
    const selectable = selectableLayers(drawing);

    for (const element of topDown(drawing)) {
        if (!selectable.has(element.layerId)) continue;

        if (hitTestElement(element, lookup, p, tolerance)) {
            return element;
        }
    }

    return null;
}

/**
 * Everything caught by a rubber band. `window` takes only what is completely inside;
 * `crossing` takes anything the band touches.
 */
export function pickInBounds(
    drawing: HashiraDocument,
    bounds: Bounds,
    mode: MarqueeMode,
): Element[] {
    const lookup = makeLookup(drawing.elements);
    const selectable = selectableLayers(drawing);

    return drawing.elements.filter((element) => {
        if (!selectable.has(element.layerId)) return false;

        const elementArea = elementBounds(element, lookup);

        if (elementArea === null) return false;

        return mode === 'window'
            ? boundsContain(bounds, elementArea)
            : boundsIntersect(bounds, elementArea);
    });
}
