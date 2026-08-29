import { z } from 'zod';

import { newId } from './id';

import {
    SCHEMA_VERSION,
    type DocumentSettings,
    type Element,
    type HashiraDocument,
    type Layer,
} from './types';

/**
 * Reading a document from the server, a file or a paste buffer.
 *
 * The pipeline is: version check → migration → validation. It follows the rules written down
 * in docs/document-format.md, and the one worth restating is that a single broken element
 * must not cost anyone their drawing. The envelope is all-or-nothing; the contents are not.
 */

const finiteNumber = z.number().refine(Number.isFinite, 'must be a finite number');
const pointSchema = z.object({ x: finiteNumber, y: finiteNumber });
const transformSchema = z.object({
    x: finiteNumber,
    y: finiteNumber,
    rotation: finiteNumber,
});

const styleSchema = z
    .object({
        stroke: z.string().optional(),
        fill: z.string().nullable().optional(),
        strokeWidth: finiteNumber.positive().optional(),
        dash: z.array(finiteNumber.nonnegative()).nullable().optional(),
    })
    .optional();

const metadataSchema = z
    .object({
        createdAt: z.string().optional(),
        label: z.string().nullable().optional(),
    })
    .optional();

const baseFields = {
    id: z.string().min(1),
    layerId: z.string().min(1),
    transform: transformSchema,
    style: styleSchema,
    metadata: metadataSchema,
};

const elementSchema = z.discriminatedUnion('type', [
    z.object({
        ...baseFields,
        type: z.literal('wall'),
        geometry: z.object({
            a: pointSchema,
            b: pointSchema,
            thickness: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('line'),
        geometry: z.object({ a: pointSchema, b: pointSchema }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('rect'),
        geometry: z.object({ width: finiteNumber.positive(), height: finiteNumber.positive() }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('circle'),
        geometry: z.object({ radius: finiteNumber.positive() }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('polygon'),
        geometry: z.object({ points: z.array(pointSchema).min(2), closed: z.boolean() }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('room'),
        geometry: z.object({ points: z.array(pointSchema).min(3) }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('door'),
        geometry: z.object({
            hostId: z.string().min(1),
            offset: finiteNumber,
            width: finiteNumber.positive(),
            swing: z.enum(['left', 'right']),
            flipped: z.boolean(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('window'),
        geometry: z.object({
            hostId: z.string().min(1),
            offset: finiteNumber,
            width: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('asset'),
        geometry: z.object({
            assetId: z.string().min(1),
            width: finiteNumber.positive(),
            height: finiteNumber.positive(),
            mirrored: z.boolean(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('text'),
        geometry: z.object({
            content: z.string(),
            fontSize: finiteNumber.positive(),
            align: z.enum(['left', 'center', 'right']),
        }),
    }),
]);

const layerSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    color: z.string().min(1),
    visible: z.boolean(),
    locked: z.boolean(),
    order: finiteNumber,
});

const settingsSchema = z
    .object({
        unit: z.enum(['mm', 'cm', 'm']).optional(),
        scale: finiteNumber.positive().optional(),
        grid: z
            .object({
                size: finiteNumber.positive().optional(),
                subdivisions: z.number().int().min(1).max(20).optional(),
                visible: z.boolean().optional(),
                snap: z.boolean().optional(),
            })
            .optional(),
        snapping: z
            .object({
                enabled: z.boolean().optional(),
                endpoint: z.boolean().optional(),
                midpoint: z.boolean().optional(),
                intersection: z.boolean().optional(),
                axis: z.boolean().optional(),
            })
            .optional(),
        sheet: z
            .object({
                size: z.enum(['A4', 'A3', 'A2', 'A1']).optional(),
                orientation: z.enum(['portrait', 'landscape']).optional(),
            })
            .optional(),
        title: z.string().optional(),
    })
    .optional();

export const DEFAULT_SETTINGS: DocumentSettings = {
    unit: 'm',
    scale: 50,
    grid: { size: 100, subdivisions: 2, visible: true, snap: true },
    snapping: { enabled: true, endpoint: true, midpoint: true, intersection: true, axis: true },
    sheet: { size: 'A3', orientation: 'landscape' },
    title: '',
};

/** Mirrors DocumentSchema::defaultLayers() on the server. */
export function defaultLayers(): Layer[] {
    return [
        {
            id: 'layer_architecture',
            name: 'Architecture',
            color: '#1F2328',
            visible: true,
            locked: false,
            order: 0,
        },
        {
            id: 'layer_openings',
            name: 'Openings',
            color: '#1F2328',
            visible: true,
            locked: false,
            order: 1,
        },
        {
            id: 'layer_furniture',
            name: 'Furniture',
            color: '#5F636B',
            visible: true,
            locked: false,
            order: 2,
        },
        {
            id: 'layer_dimensions',
            name: 'Dimensions',
            color: '#2C58C4',
            visible: true,
            locked: false,
            order: 3,
        },
        {
            id: 'layer_annotations',
            name: 'Annotations',
            color: '#5F636B',
            visible: true,
            locked: false,
            order: 4,
        },
    ];
}

/**
 * A new, empty drawing. The server creates the real one on every project, so this exists for
 * the moment before it has arrived — the editor is never handed a null document, which keeps
 * a null check out of every module that reads one.
 */
export function emptyDocument(name = 'Untitled'): HashiraDocument {
    return {
        schemaVersion: SCHEMA_VERSION,
        id: newId(),
        name,
        settings: { ...DEFAULT_SETTINGS, title: name },
        layers: defaultLayers(),
        elements: [],
    };
}

export interface DroppedElement {
    index: number;
    reason: string;
}

export type ParseResult =
    | { ok: true; document: HashiraDocument; dropped: DroppedElement[] }
    | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeSettings(raw: unknown, fallbackTitle: string): DocumentSettings {
    const parsed = settingsSchema.safeParse(raw);
    const value = parsed.success ? (parsed.data ?? {}) : {};

    return {
        unit: value.unit ?? DEFAULT_SETTINGS.unit,
        scale: value.scale ?? DEFAULT_SETTINGS.scale,
        grid: { ...DEFAULT_SETTINGS.grid, ...value.grid },
        snapping: { ...DEFAULT_SETTINGS.snapping, ...value.snapping },
        sheet: { ...DEFAULT_SETTINGS.sheet, ...value.sheet },
        title: value.title ?? fallbackTitle,
    };
}

/**
 * Bring an older document up to the current schema. Each step is a pure function with its own
 * fixture test; there are none yet because there has only ever been one version.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
    return raw;
}

export function parseDocument(raw: unknown): ParseResult {
    if (!isRecord(raw)) {
        return { ok: false, reason: 'This drawing is not in a readable format.' };
    }

    const version = raw.schemaVersion;

    if (typeof version !== 'number' || !Number.isInteger(version)) {
        return { ok: false, reason: 'This drawing is missing its schema version.' };
    }

    if (version > SCHEMA_VERSION) {
        return {
            ok: false,
            reason: `This drawing was written by a newer version of Hashira (schema ${version}). Update to open it.`,
        };
    }

    const migrated = migrate(raw);
    const name = typeof migrated.name === 'string' ? migrated.name : 'Untitled';

    const layers = Array.isArray(migrated.layers)
        ? migrated.layers.flatMap((layer): Layer[] => {
              const parsed = layerSchema.safeParse(layer);

              return parsed.success ? [parsed.data] : [];
          })
        : [];

    // A drawing with no readable layers would have nowhere to put its elements, so it gets
    // the standard set rather than being refused.
    const resolvedLayers = layers.length > 0 ? layers : defaultLayers();
    const layerIds = new Set(resolvedLayers.map((layer) => layer.id));
    const fallbackLayerId = resolvedLayers[0]?.id ?? 'layer_architecture';

    const dropped: DroppedElement[] = [];
    const rawElements = Array.isArray(migrated.elements) ? migrated.elements : [];
    const elements: Element[] = [];

    for (const [index, candidate] of rawElements.entries()) {
        const parsed = elementSchema.safeParse(candidate);

        if (!parsed.success) {
            dropped.push({ index, reason: parsed.error.issues[0]?.message ?? 'invalid element' });
            continue;
        }

        const element: Element = parsed.data;

        elements.push(
            layerIds.has(element.layerId) ? element : { ...element, layerId: fallbackLayerId },
        );
    }

    // Hosted openings are resolved after the fact: a door may legitimately appear before its
    // wall in the array, so the host has to be looked for against the finished set.
    const elementIds = new Set(elements.map((element) => element.id));
    const kept = elements.filter((element, index) => {
        if (element.type !== 'door' && element.type !== 'window') {
            return true;
        }

        if (elementIds.has(element.geometry.hostId)) {
            return true;
        }

        dropped.push({ index, reason: 'the wall this opening belongs to is missing' });

        return false;
    });

    return {
        ok: true,
        dropped,
        document: {
            schemaVersion: SCHEMA_VERSION,
            id: typeof migrated.id === 'string' ? migrated.id : newId(),
            name,
            settings: mergeSettings(migrated.settings, name),
            layers: [...resolvedLayers].sort((a, b) => a.order - b.order),
            elements: kept,
        },
    };
}
