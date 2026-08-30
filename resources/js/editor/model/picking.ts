import { boundsContain, boundsIntersect, expandBounds, type Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';

import { documentIndex } from './documentIndex';
import { hitTestElement } from './elements';
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

/**
 * The topmost element under `p`, or null. `tolerance` is in world millimetres.
 *
 * Only the elements whose bounds reach the pointer are considered, so a hover costs the same
 * on a plan with a thousand elements as on one with ten.
 */
export function pickAt(drawing: HashiraDocument, p: Point, tolerance: number): Element | null {
    const index = documentIndex(drawing);
    const selectable = selectableLayers(drawing);
    const reach = expandBounds({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, tolerance);

    const candidates = index.near(reach).filter((element) => selectable.has(element.layerId));

    for (const element of index.sortTopDown(candidates)) {
        if (hitTestElement(element, index.lookup, p, tolerance)) {
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
    const index = documentIndex(drawing);
    const selectable = selectableLayers(drawing);

    return index.near(bounds).filter((element) => {
        if (!selectable.has(element.layerId)) return false;

        const elementArea = index.bounds(element);

        if (elementArea === null) return false;

        return mode === 'window'
            ? boundsContain(bounds, elementArea)
            : boundsIntersect(bounds, elementArea);
    });
}
