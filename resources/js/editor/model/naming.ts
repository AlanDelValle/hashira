import { polygonArea } from '@/editor/geometry/polygon';

import { findAsset } from '@/editor/assets/library';
import { elementLength, elementWorldPoints, type ElementLookup } from './elements';
import { leafLabel } from './openings';
import type { DisplayUnit, Element } from './types';
import { formatArea, formatLength } from './units';

/**
 * What an element calls itself.
 *
 * A scene tree has to name several hundred rows, and nothing in the format holds a name for
 * one — so the name is **derived until somebody types one**. A text calls itself by its own
 * words, a wall by how long it is, a door by what it is and how wide, a block by the block. It
 * costs the document nothing and it cannot go stale, which is the same reasoning that keeps a
 * dimension from storing its value.
 *
 * A name somebody does type goes to `metadata.label`, which has been in the format since
 * version 1 and which nothing has ever read until now.
 */

/** Human names for each type, for the rows a derived name has nothing better to say about. */
const FALLBACK: Record<Element['type'], string> = {
    wall: 'Wall',
    line: 'Line',
    rect: 'Rectangle',
    circle: 'Circle',
    polygon: 'Polygon',
    room: 'Room',
    door: 'Door',
    window: 'Window',
    asset: 'Block',
    text: 'Text',
    dimension: 'Dimension',
    angle: 'Angle',
    radius: 'Radius',
    leader: 'Leader',
    cloud: 'Revision cloud',
    underlay: 'Underlay',
};

/** How much of a long note or label a row shows before it gives up. */
const CUT = 40;

export function elementName(element: Element, lookup: ElementLookup, unit: DisplayUnit): string {
    const typed = element.metadata?.label?.trim();

    if (typed !== undefined && typed !== '') {
        return typed;
    }

    return derived(element, lookup, unit);
}

/** True when the row is showing what somebody typed rather than what the drawing worked out. */
export function isNamed(element: Element): boolean {
    const typed = element.metadata?.label?.trim();

    return typed !== undefined && typed !== '';
}

function derived(element: Element, lookup: ElementLookup, unit: DisplayUnit): string {
    switch (element.type) {
        // The words are the element. Anything else here would be a worse name than the one
        // already written on the sheet.
        case 'text':
            return shorten(element.geometry.content) ?? FALLBACK.text;

        case 'leader':
            return shorten(element.geometry.content) ?? FALLBACK.leader;

        case 'wall':
        case 'line':
            return withSize(FALLBACK[element.type], elementLength(element), unit);

        case 'room': {
            const area = polygonArea(elementWorldPoints(element, lookup));

            return area > 0 ? `${FALLBACK.room} · ${formatArea(area, unit)}` : FALLBACK.room;
        }

        // A door is named by how it operates rather than by the word "door": on a list of
        // twenty openings, "Sliding · 0.900 m" is the one somebody is looking for.
        case 'door':
            return withSize(leafLabel(element.geometry.leaf), element.geometry.width, unit);

        case 'window':
            return withSize(FALLBACK.window, element.geometry.width, unit);

        case 'asset':
            return findAsset(element.geometry.assetId)?.name ?? FALLBACK.asset;

        case 'dimension': {
            const points = elementWorldPoints(element, lookup);
            const first = points[0];
            const last = points[points.length - 1];

            return first === undefined || last === undefined
                ? FALLBACK.dimension
                : withSize(
                      FALLBACK.dimension,
                      Math.hypot(last.x - first.x, last.y - first.y),
                      unit,
                  );
        }

        case 'circle':
            return withSize(FALLBACK.circle, element.geometry.radius * 2, unit);

        case 'rect':
            return `${FALLBACK.rect} · ${formatLength(element.geometry.width, unit)} × ${formatLength(
                element.geometry.height,
                unit,
            )}`;

        case 'polygon':
        case 'angle':
        case 'radius':
        case 'cloud':
        case 'underlay':
            return FALLBACK[element.type];
    }
}

function withSize(name: string, size: number | null, unit: DisplayUnit): string {
    return size === null || size <= 0 ? name : `${name} · ${formatLength(size, unit)}`;
}

/** A row is one line: a note three sentences long is cut rather than allowed to wrap. */
function shorten(content: string): string | null {
    const trimmed = content.trim().replace(/\s+/gu, ' ');

    if (trimmed === '') {
        return null;
    }

    return trimmed.length > CUT ? `${trimmed.slice(0, CUT - 1)}…` : trimmed;
}
