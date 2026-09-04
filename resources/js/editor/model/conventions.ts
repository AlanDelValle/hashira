import { HATCHES } from './hatches';
import { LINE_TYPES } from './lineTypes';
import type { Element, HatchPattern, LineType } from './types';

/**
 * What a drawing is read by, gathered from the drawing itself.
 *
 * A hatch and a line type are both answers to the same question a reader asks of a mark on the
 * sheet — what does this one mean — so they are gathered together and printed as one key
 * rather than as two lists that happen to sit under each other.
 *
 * Only what is actually used, and only where it is actually drawn. A key that lists every
 * convention the editor knows is a page from the standard rather than a legend for this
 * drawing, and a convention on an element nothing paints it on would be a key naming a mark
 * that is not on the sheet.
 */

/**
 * The element types a hatch is painted on, and the types a line type is drawn with.
 *
 * These are the same two lists the properties panel gates its two pickers by — they live here
 * because the key has to agree with them exactly. They are not one list: a wall and a room are
 * hatched and never re-lined, because what those mean is decided by what they are, and a line
 * has no inside to fill.
 */
export const HATCHABLE: Element['type'][] = ['wall', 'room', 'rect', 'polygon', 'circle'];

export const LINE_TYPED: Element['type'][] = ['line', 'rect', 'polygon', 'circle'];

export type KeyEntry =
    | { kind: 'hatch'; id: HatchPattern; name: string }
    | { kind: 'line'; id: LineType; name: string };

/**
 * The conventions these elements use, in the order the catalogues define them.
 *
 * Catalogue order rather than order of appearance, so that the same drawing prints the same
 * key twice running and two sheets of one set can be read against each other. Hatches first:
 * they say what a thing is, and a line says how to read its edge.
 *
 * A line type nobody named is not listed. Absent means contínua larga, which is what these
 * shapes are drawn as anyway — a reader meeting a plain continuous line is not looking
 * anything up, and naming it in the key would be the same mistake as storing it on the
 * element.
 */
export function conventionsUsed(
    elements: readonly Element[],
    layerIds: ReadonlySet<string>,
): KeyEntry[] {
    const hatches = new Set<HatchPattern>();
    const lines = new Set<LineType>();

    for (const element of elements) {
        if (!layerIds.has(element.layerId)) {
            continue;
        }

        const hatch = element.style?.hatch;
        const line = element.style?.lineType;

        if (hatch !== undefined && hatch !== null && HATCHABLE.includes(element.type)) {
            hatches.add(hatch);
        }

        if (line !== undefined && line !== null && LINE_TYPED.includes(element.type)) {
            lines.add(line);
        }
    }

    return [
        ...HATCHES.filter((hatch) => hatches.has(hatch.id)).map((hatch): KeyEntry => ({
            kind: 'hatch',
            id: hatch.id,
            name: hatch.name,
        })),
        ...LINE_TYPES.filter((type) => lines.has(type.id)).map((type): KeyEntry => ({
            kind: 'line',
            id: type.id,
            name: type.use,
        })),
    ];
}
