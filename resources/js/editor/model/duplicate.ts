import type { Point } from '@/editor/geometry/vec';

import { translateElement, type ElementLookup } from './elements';
import { newId } from './id';
import type { Element } from './types';

/**
 * Copy elements, giving each a fresh identity.
 *
 * Hosted elements are remapped: duplicating a wall together with its door produces a door
 * hosted on the *new* wall, while duplicating a door on its own leaves it on the wall it
 * already cut. Getting this wrong is how a copy silently rewires the original.
 */
export function duplicateElements(
    elements: readonly Element[],
    offset: Point,
    lookup: ElementLookup,
): Element[] {
    const remap = new Map(elements.map((element) => [element.id, newId()]));

    return elements.map((element): Element => {
        const id = remap.get(element.id) ?? newId();

        // Door and window are handled apart rather than together: narrowing them as one
        // union leaves `geometry` a union too, which is no longer either element's shape.
        if (element.type === 'door') {
            const hostId = remap.get(element.geometry.hostId) ?? element.geometry.hostId;

            return { ...element, id, geometry: { ...element.geometry, hostId } };
        }

        if (element.type === 'window') {
            const hostId = remap.get(element.geometry.hostId) ?? element.geometry.hostId;

            return { ...element, id, geometry: { ...element.geometry, hostId } };
        }

        // A radius is hosted too: copy a circle with its radius and the copy measures the
        // copy, not the original.
        if (element.type === 'radius') {
            const hostId = remap.get(element.geometry.hostId) ?? element.geometry.hostId;

            return { ...element, id, geometry: { ...element.geometry, hostId } };
        }

        return translateElement({ ...element, id }, offset, lookup);
    });
}
