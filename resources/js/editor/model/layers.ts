import { newId } from './id';
import type { Element, Layer } from './types';

/**
 * Editing the list of layers.
 *
 * Pure functions returning a new list, so the panel above them stays a thin thing that turns
 * one of these into a command. Which layer is *active* is not here and never will be: that
 * belongs to the person drawing rather than to the drawing, and it is not saved.
 *
 * `docs/document-format.md` §3 has said since it was written that a layer can only be deleted
 * once it is empty, and that the interface offers to move its contents first. It said so for a
 * long time while none of it existed.
 */

/** The colour a layer starts at: the same ink the architecture layer is drawn in. */
const DEFAULT_COLOUR = '#1F2328';

export function addLayer(layers: readonly Layer[], name: string): Layer[] {
    const top = layers.reduce((highest, layer) => Math.max(highest, layer.order), -1);

    return [
        ...layers,
        {
            id: `layer_${newId()}`,
            name: name.trim() === '' ? `Layer ${layers.length + 1}` : name.trim(),
            color: DEFAULT_COLOUR,
            visible: true,
            locked: false,
            order: top + 1,
        },
    ];
}

export function renameLayer(layers: readonly Layer[], id: string, name: string): Layer[] {
    const trimmed = name.trim();

    // A layer with no name is a row nobody can point at, so an empty one is refused rather
    // than stored — the same rule a leader with nothing written on it follows.
    if (trimmed === '') {
        return [...layers];
    }

    return layers.map((layer) => (layer.id === id ? { ...layer, name: trimmed } : layer));
}

export function recolourLayer(layers: readonly Layer[], id: string, color: string): Layer[] {
    return layers.map((layer) => (layer.id === id ? { ...layer, color } : layer));
}

export function removeLayer(layers: readonly Layer[], id: string): Layer[] {
    // The last one never goes: a drawing with no layers has nowhere to put the next thing
    // drawn on it, and every element in the format names the layer it belongs to.
    return layers.length <= 1 ? [...layers] : layers.filter((layer) => layer.id !== id);
}

/**
 * Swap two neighbours' painting order.
 *
 * The order is a number on each layer rather than a position in the array, so moving one is
 * exchanging two numbers and re-sorting — not splicing a list and hoping the rest follows.
 */
export function moveLayer(layers: readonly Layer[], index: number, direction: -1 | 1): Layer[] {
    const sorted = [...layers].sort((one, other) => one.order - other.order);
    const target = index + direction;
    const from = sorted[index];
    const to = sorted[target];

    if (from === undefined || to === undefined) {
        return [...layers];
    }

    sorted[index] = { ...to, order: from.order };
    sorted[target] = { ...from, order: to.order };

    return sorted.sort((one, other) => one.order - other.order);
}

/** Everything standing on a layer, in the order the document holds it. */
export function elementsOn(elements: readonly Element[], layerId: string): Element[] {
    return elements.filter((element) => element.layerId === layerId);
}

/** The same elements, moved. What a layer's contents are offered before it is deleted. */
export function moveToLayer(elements: readonly Element[], layerId: string): Element[] {
    return elements.map((element) => ({ ...element, layerId }));
}
