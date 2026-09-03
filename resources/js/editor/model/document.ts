import { z } from 'zod';

import { newId } from './id';
import { DEFAULT_SHEET_ORIENTATION, DEFAULT_SHEET_SIZE } from './sheets';

import {
    SCHEMA_VERSION,
    type DocumentSettings,
    type Element,
    type HashiraDocument,
    type Layer,
    type Sheet,
    type TitleBlock,
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
        hatch: z
            .enum([
                'existing',
                'demolish',
                'new',
                'concrete',
                'concrete-view',
                'mortar',
                'steel',
                'rubber',
                'wood',
                'plywood',
                'earth',
                'fill',
                'stone',
                'stone-view',
                'floor-fill',
            ])
            .nullable()
            .optional(),
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

/*
 * Exported, along with `layerSchema`, `sheetSchema` and `mergeSettings` below, because a
 * command arriving from somewhere else carries the same pieces a document does and must be
 * held to the same rules. A second set of schemas for the same shapes is a second set to keep
 * in step — see commands/envelope.ts.
 */
export const elementSchema = z.discriminatedUnion('type', [
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
            leaf: z.enum(['single', 'double', 'sliding', 'folding', 'overhead', 'gate', 'none']),
            head: z.enum(['square', 'arch']),
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
        type: z.literal('dimension'),
        geometry: z.object({
            points: z.array(pointSchema).min(2),
            offset: finiteNumber,
            fontSize: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('angle'),
        geometry: z.object({
            vertex: pointSchema,
            from: pointSchema,
            to: pointSchema,
            radius: finiteNumber.positive(),
            fontSize: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('radius'),
        geometry: z.object({
            hostId: z.string().min(1),
            angle: finiteNumber,
            diameter: z.boolean(),
            fontSize: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('leader'),
        geometry: z.object({
            points: z.array(pointSchema).min(2),
            content: z.string().min(1),
            fontSize: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('cloud'),
        geometry: z.object({
            points: z.array(pointSchema).min(3),
            radius: finiteNumber.positive(),
        }),
    }),
    z.object({
        ...baseFields,
        type: z.literal('underlay'),
        geometry: z.object({
            underlayId: z.string().min(1),
            width: finiteNumber.positive(),
            height: finiteNumber.positive(),
            opacity: finiteNumber.min(0).max(1),
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

export const layerSchema = z.object({
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
        title: z.string().optional(),
        notes: z.string().optional(),
        titleBlock: z
            .object({
                project: z.string().optional(),
                client: z.string().optional(),
                drawnBy: z.string().optional(),
                revision: z.string().optional(),
                date: z.string().optional(),
            })
            .optional(),
    })
    .optional();

/**
 * A sheet is validated whole, unlike the rest of the settings.
 *
 * Every field decides where ink lands on a page, so there is no sensible half of one to keep
 * — a sheet either says what it prints or it is not a sheet. It is parsed one at a time and
 * away from the settings above, so that a single unreadable page cannot cost a drawing its
 * grid, its units and everything else in the same object.
 */
export const sheetSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.enum(['A4', 'A3', 'A2', 'A1']),
    orientation: z.enum(['portrait', 'landscape']),
    scale: finiteNumber.positive(),
    centre: pointSchema.nullable(),
});

const DEFAULT_SCALE = 50;

/** Mirrors DocumentSchema::defaultSheets() on the server. */
export function defaultSheets(scale: number): Sheet[] {
    return [
        {
            id: 'sheet_1',
            name: 'Sheet 1',
            size: DEFAULT_SHEET_SIZE,
            orientation: DEFAULT_SHEET_ORIENTATION,
            scale,
            centre: null,
        },
    ];
}

/** Mirrors DocumentSchema::emptyTitleBlock() on the server. */
export function emptyTitleBlock(): TitleBlock {
    return { project: '', client: '', drawnBy: '', revision: '', date: '' };
}

export const DEFAULT_SETTINGS: DocumentSettings = {
    unit: 'm',
    scale: DEFAULT_SCALE,
    grid: { size: 100, subdivisions: 2, visible: true, snap: true },
    snapping: { enabled: true, endpoint: true, midpoint: true, intersection: true, axis: true },
    sheets: defaultSheets(DEFAULT_SCALE),
    title: '',
    titleBlock: emptyTitleBlock(),
    notes: '',
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
        settings: {
            ...DEFAULT_SETTINGS,
            sheets: defaultSheets(DEFAULT_SCALE),
            titleBlock: emptyTitleBlock(),
            title: name,
        },
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

export function mergeSettings(raw: unknown, fallbackTitle: string): DocumentSettings {
    const parsed = settingsSchema.safeParse(raw);
    const value = parsed.success ? (parsed.data ?? {}) : {};
    const scale = value.scale ?? DEFAULT_SETTINGS.scale;

    return {
        unit: value.unit ?? DEFAULT_SETTINGS.unit,
        scale,
        grid: { ...DEFAULT_SETTINGS.grid, ...value.grid },
        snapping: { ...DEFAULT_SETTINGS.snapping, ...value.snapping },
        sheets: resolveSheets(isRecord(raw) ? raw.sheets : undefined, scale),
        title: value.title ?? fallbackTitle,
        titleBlock: { ...emptyTitleBlock(), ...value.titleBlock },
        notes: value.notes ?? '',
    };
}

/**
 * The sheets a drawing was saved with, dropping any that cannot be read.
 *
 * A drawing with no readable sheet is given one, the same way a drawing with no readable
 * layer is given the standard set: there is nowhere to print it otherwise, and refusing to
 * open a plan over a page size is not a trade anybody would take.
 */
function resolveSheets(raw: unknown, scale: number): Sheet[] {
    const parsed = Array.isArray(raw)
        ? raw.flatMap((sheet): Sheet[] => {
              const result = sheetSchema.safeParse(sheet);

              return result.success ? [result.data] : [];
          })
        : [];

    return parsed.length > 0 ? parsed : defaultSheets(scale);
}

/**
 * Bring an older document up to the current schema. Each step is a pure function with its own
 * fixture test.
 *
 * 1 → 2 added the `dimension` element. Nothing already written changes shape, so the step only
 * restamps the version — but it is a real step rather than a silent pass, because the drawing
 * is genuinely being handed forward and the next one has work to do.
 *
 * 2 → 3 turned a dimension's two measured points into a run of them, so that a chain of
 * measurements is one mark on the sheet rather than a row of separate ones. Every dimension
 * ever written has exactly two, which is a chain of one.
 *
 * 3 → 4 added the `underlay`. Nothing already written changes shape, so the step restamps the
 * version — but a reader that predates the type would drop every underlay in a drawing and
 * save it back without them, which is why it is a version at all.
 *
 * 4 → 5 gave a drawing more than one sheet. The single `settings.sheet` becomes the first of
 * a list, carrying the drawing's own scale onto it — so a drawing opens onto exactly the page
 * it was already being printed at, and gains the ability to have a second one.
 *
 * 5 → 6 added what a title block says beyond the title, and the revision cloud. Nothing
 * already written changes shape, so the step restamps the version and lets the settings fill
 * their own blanks — but a reader that predates either would drop every cloud in a drawing and
 * every field of its title block, and then save it back without them.
 *
 * 6 → 7 added the drawing's notes, printed beside it. Again nothing already written changes
 * shape, and again an older reader would drop them on the way back out.
 *
 * 7 → 8 told every door how it operates and how it is closed at the top. Every door ever
 * written is a single leaf under a square head — that is the only door the editor could draw
 * — so the step fills both in rather than guessing, and a drawing comes forward looking
 * exactly as it did.
 *
 * 8 → 9 added the hatch a shape is filled with. Nothing already written changes shape and no
 * drawing gains a hatch, because a wall with none is a wall filled solid, which is what every
 * wall already was. The version is a version because of what an older reader would do on the
 * way back out: drop the field, and hand back a demolition plan with nothing marked for
 * demolition.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
    let document = raw;

    if (document.schemaVersion === 1) {
        document = { ...document, schemaVersion: 2 };
    }

    if (document.schemaVersion === 2) {
        const elements = Array.isArray(document.elements) ? document.elements : [];

        document = {
            ...document,
            schemaVersion: 3,
            elements: elements.map((element) => chainedDimension(element)),
        };
    }

    if (document.schemaVersion === 3) {
        document = { ...document, schemaVersion: 4 };
    }

    if (document.schemaVersion === 4) {
        document = {
            ...document,
            schemaVersion: 5,
            settings: sheetAsList(document.settings),
        };
    }

    if (document.schemaVersion === 5) {
        document = { ...document, schemaVersion: 6 };
    }

    if (document.schemaVersion === 6) {
        document = { ...document, schemaVersion: 7 };
    }

    if (document.schemaVersion === 7) {
        const elements = Array.isArray(document.elements) ? document.elements : [];

        document = {
            ...document,
            schemaVersion: 8,
            elements: elements.map((element) => operatedDoor(element)),
        };
    }

    if (document.schemaVersion === 8) {
        document = { ...document, schemaVersion: 9 };
    }

    return document;
}

/** A schema-7 door, which could only ever be a single leaf under a square head. */
function operatedDoor(element: unknown): unknown {
    if (!isRecord(element) || element.type !== 'door' || !isRecord(element.geometry)) {
        return element;
    }

    return {
        ...element,
        geometry: { ...element.geometry, leaf: 'single', head: 'square' },
    };
}

/** A schema-4 drawing's one page size, as the first sheet of the list that replaced it. */
function sheetAsList(settings: unknown): unknown {
    if (!isRecord(settings)) {
        return settings;
    }

    const { sheet, ...rest } = settings;
    const page = isRecord(sheet) ? sheet : {};
    const scale = typeof rest.scale === 'number' ? rest.scale : DEFAULT_SCALE;

    return {
        ...rest,
        sheets: [
            {
                id: 'sheet_1',
                name: 'Sheet 1',
                size: page.size ?? DEFAULT_SHEET_SIZE,
                orientation: page.orientation ?? DEFAULT_SHEET_ORIENTATION,
                scale,
                centre: null,
            },
        ],
    };
}

/** A schema-2 dimension, as a run of the two points it was written with. */
function chainedDimension(element: unknown): unknown {
    if (!isRecord(element) || element.type !== 'dimension' || !isRecord(element.geometry)) {
        return element;
    }

    const { a, b, ...rest } = element.geometry;

    if (!isRecord(a) || !isRecord(b)) {
        return element;
    }

    return { ...element, geometry: { ...rest, points: [a, b] } };
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

    // Hosted elements are resolved after the fact: a door may legitimately appear before its
    // wall in the array, so the host has to be looked for against the finished set.
    const elementIds = new Set(elements.map((element) => element.id));
    const kept = elements.filter((element, index) => {
        if (element.type === 'radius') {
            if (elementIds.has(element.geometry.hostId)) {
                return true;
            }

            dropped.push({ index, reason: 'the circle this measurement belongs to is missing' });

            return false;
        }

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
