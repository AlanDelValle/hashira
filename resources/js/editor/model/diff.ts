import { unionBounds, type Bounds } from '@/editor/geometry/bbox';

import { elementBounds, type ElementLookup } from './elements';
import type { DocumentSettings, Element, HashiraDocument, Layer } from './types';

/**
 * What changed between two versions of a drawing.
 *
 * A version is a whole document rather than a list of edits — the drawing is one JSONB column
 * and a snapshot copies it — so the only way to say what happened between two of them is to
 * compare them. This does that structurally: elements are matched by id, and anything whose
 * record is not identical is reported along with which part of it moved.
 *
 * Three things are worth knowing about what comes out.
 *
 * **Both sides must have been through `parseDocument` first.** It migrates, and a schema 5
 * document compared against a schema 6 one would report the migration as somebody's work.
 *
 * **A hosted opening does not change when its wall does.** A door stores a distance along a
 * wall, so moving the wall moves the door on the sheet while leaving the door's own record
 * exactly as it was. The list says the wall changed, because that is what happened; the
 * picture shows the door somewhere else, because that is also what happened.
 *
 * **Order is a change even when nothing else is.** Within a layer, later elements paint on
 * top, so restacking two overlapping shapes alters the drawing without altering a single
 * element. `reordered` is what stops that being reported as "no changes".
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

/** The parts of an element that can differ: the record's own top-level keys. */
export type ElementField = 'type' | 'layerId' | 'transform' | 'geometry' | 'style' | 'metadata';

export type LayerField = 'name' | 'color' | 'visible' | 'locked' | 'order';

const ELEMENT_FIELDS: readonly ElementField[] = [
    'type',
    'layerId',
    'transform',
    'geometry',
    'style',
    'metadata',
];

const LAYER_FIELDS: readonly LayerField[] = ['name', 'color', 'visible', 'locked', 'order'];

const SETTINGS_FIELDS: readonly (keyof DocumentSettings)[] = [
    'unit',
    'scale',
    'grid',
    'snapping',
    'sheets',
    'title',
    'titleBlock',
    'notes',
];

/*
 * Field names as a person would say them. `transform` is the word the format uses because it
 * is one; what somebody reading a change list wants to know is that the thing moved.
 */
const ELEMENT_FIELD_LABELS: Record<ElementField, string> = {
    type: 'kind',
    layerId: 'layer',
    transform: 'placement',
    geometry: 'shape',
    style: 'appearance',
    metadata: 'label',
};

const LAYER_FIELD_LABELS: Record<LayerField, string> = {
    name: 'name',
    color: 'colour',
    visible: 'visibility',
    locked: 'lock',
    order: 'order',
};

const SETTINGS_FIELD_LABELS: Record<keyof DocumentSettings, string> = {
    unit: 'display unit',
    scale: 'drawing scale',
    grid: 'grid',
    snapping: 'snapping',
    sheets: 'sheets',
    title: 'title',
    titleBlock: 'title block',
    notes: 'notes',
};

export interface ElementChange {
    kind: ChangeKind;
    id: string;
    type: Element['type'];
    /** Where it reads as living: its layer now, or the layer it was on when it went. */
    layerId: string;
    before: Element | null;
    after: Element | null;
    /** For `changed`, which parts differ, in a stable order. Empty otherwise. */
    fields: readonly ElementField[];
}

export interface LayerChange {
    kind: ChangeKind;
    id: string;
    name: string;
    before: Layer | null;
    after: Layer | null;
    fields: readonly LayerField[];
}

export interface SettingsChange {
    key: keyof DocumentSettings;
    before: unknown;
    after: unknown;
}

export interface DocumentDiff {
    /** Added and changed in the newer document's order, then removed in the older one's. */
    elements: readonly ElementChange[];
    layers: readonly LayerChange[];
    settings: readonly SettingsChange[];
    /** The drawing's own name, when it was renamed. */
    name: { before: string; after: string } | null;
    /** Elements that survived both versions no longer paint in the same order. */
    reordered: boolean;
    counts: { added: number; removed: number; changed: number };
    /** Nothing differs at all — not an element, not a layer, not a setting, not the order. */
    empty: boolean;
}

export function diffDocuments(before: HashiraDocument, after: HashiraDocument): DocumentDiff {
    const wasById = new Map(before.elements.map((element) => [element.id, element]));
    const isById = new Map(after.elements.map((element) => [element.id, element]));

    const elements: ElementChange[] = [];

    for (const element of after.elements) {
        const was = wasById.get(element.id);

        if (was === undefined) {
            elements.push({
                kind: 'added',
                id: element.id,
                type: element.type,
                layerId: element.layerId,
                before: null,
                after: element,
                fields: [],
            });

            continue;
        }

        const fields = differingElementFields(was, element);

        if (fields.length > 0) {
            elements.push({
                kind: 'changed',
                id: element.id,
                type: element.type,
                layerId: element.layerId,
                before: was,
                after: element,
                fields,
            });
        }
    }

    for (const element of before.elements) {
        if (!isById.has(element.id)) {
            elements.push({
                kind: 'removed',
                id: element.id,
                type: element.type,
                layerId: element.layerId,
                before: element,
                after: null,
                fields: [],
            });
        }
    }

    const layers = diffLayers(before.layers, after.layers);

    const settings = SETTINGS_FIELDS.flatMap((key): SettingsChange[] =>
        equalJson(before.settings[key], after.settings[key])
            ? []
            : [{ key, before: before.settings[key], after: after.settings[key] }],
    );

    const name = before.name === after.name ? null : { before: before.name, after: after.name };
    const reordered = orderChanged(before.elements, after.elements);

    const counts = {
        added: elements.filter((change) => change.kind === 'added').length,
        removed: elements.filter((change) => change.kind === 'removed').length,
        changed: elements.filter((change) => change.kind === 'changed').length,
    };

    return {
        elements,
        layers,
        settings,
        name,
        reordered,
        counts,
        empty:
            elements.length === 0 &&
            layers.length === 0 &&
            settings.length === 0 &&
            name === null &&
            !reordered,
    };
}

function diffLayers(before: readonly Layer[], after: readonly Layer[]): LayerChange[] {
    const wasById = new Map(before.map((layer) => [layer.id, layer]));
    const isById = new Map(after.map((layer) => [layer.id, layer]));
    const changes: LayerChange[] = [];

    for (const layer of after) {
        const was = wasById.get(layer.id);

        if (was === undefined) {
            changes.push({
                kind: 'added',
                id: layer.id,
                name: layer.name,
                before: null,
                after: layer,
                fields: [],
            });

            continue;
        }

        const fields = LAYER_FIELDS.filter((field) => !equalJson(was[field], layer[field]));

        if (fields.length > 0) {
            changes.push({
                kind: 'changed',
                id: layer.id,
                name: layer.name,
                before: was,
                after: layer,
                fields,
            });
        }
    }

    for (const layer of before) {
        if (!isById.has(layer.id)) {
            changes.push({
                kind: 'removed',
                id: layer.id,
                name: layer.name,
                before: layer,
                after: null,
                fields: [],
            });
        }
    }

    return changes;
}

/**
 * Did the elements the two versions have in common change places?
 *
 * Only the survivors are compared, so deleting the third of four elements is not a reordering
 * of the other three — which is exactly the sort of noise that would make the flag useless.
 */
function orderChanged(before: readonly Element[], after: readonly Element[]): boolean {
    const surviving = new Set(after.map((element) => element.id));
    const was = before.filter((element) => surviving.has(element.id)).map((element) => element.id);

    const kept = new Set(was);
    const now = after.filter((element) => kept.has(element.id)).map((element) => element.id);

    return was.some((id, index) => now[index] !== id);
}

function differingElementFields(before: Element, after: Element): ElementField[] {
    // Read as plain records: every member of the union carries these keys, and TypeScript will
    // not index a union by a union of keys without being told so.
    const was = before as unknown as Record<ElementField, unknown>;
    const now = after as unknown as Record<ElementField, unknown>;

    return ELEMENT_FIELDS.filter((field) => !equalJson(was[field], now[field]));
}

/**
 * Structural equality for the plain JSON a document is made of.
 *
 * A missing key and an explicit `undefined` describe the same absence and compare equal; an
 * explicit `null` does not, because the format uses it to mean "no fill" rather than "no
 * opinion". There are no dates, maps, sets or class instances in a document to worry about.
 */
function equalJson(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => equalJson(item, b[index]))
        );
    }

    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;

    return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((key) =>
        equalJson(left[key], right[key]),
    );
}

/**
 * Where on the sheet a change happened, so that picking one out of a list can take you to it.
 *
 * A move covers two places — where it was and where it went — so both are framed. Each side is
 * measured with its own version's lookup, because where a door is is a fact about the wall it
 * was hosted on at the time.
 */
export function changeBounds(
    change: ElementChange,
    before: ElementLookup,
    after: ElementLookup,
): Bounds | null {
    return unionBounds(
        change.before === null ? null : elementBounds(change.before, before),
        change.after === null ? null : elementBounds(change.after, after),
    );
}

export function elementFieldLabel(field: ElementField): string {
    return ELEMENT_FIELD_LABELS[field];
}

export function layerFieldLabel(field: LayerField): string {
    return LAYER_FIELD_LABELS[field];
}

export function settingsFieldLabel(key: keyof DocumentSettings): string {
    return SETTINGS_FIELD_LABELS[key];
}
