/**
 * A tolerant read of the parts of a document the editor chrome needs before the full parser
 * exists: layer names, how much is on the sheet, and how measurements should be displayed.
 *
 * It never throws. A document that fails these checks is still openable — the chrome simply
 * reports what it could establish — because refusing to show a drawing at all is a worse
 * outcome than showing it without a layer list.
 */

export type DisplayUnit = 'mm' | 'cm' | 'm';

export interface LayerSummary {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
}

export interface DocumentSummary {
    schemaVersion: number | null;
    unit: DisplayUnit;
    scale: number;
    layers: LayerSummary[];
    elementCount: number;
}

const DEFAULTS = { unit: 'm', scale: 50 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDisplayUnit(value: unknown): value is DisplayUnit {
    return value === 'mm' || value === 'cm' || value === 'm';
}

function toLayer(value: unknown): LayerSummary | null {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
        return null;
    }

    return {
        id: value.id,
        name: value.name,
        visible: value.visible !== false,
        locked: value.locked === true,
    };
}

export function summarize(data: unknown): DocumentSummary {
    const document = isRecord(data) ? data : {};
    const settings = isRecord(document.settings) ? document.settings : {};

    const layers = Array.isArray(document.layers)
        ? document.layers.map(toLayer).filter((layer): layer is LayerSummary => layer !== null)
        : [];

    return {
        schemaVersion: typeof document.schemaVersion === 'number' ? document.schemaVersion : null,
        unit: isDisplayUnit(settings.unit) ? settings.unit : DEFAULTS.unit,
        scale:
            typeof settings.scale === 'number' && settings.scale > 0
                ? settings.scale
                : DEFAULTS.scale,
        layers,
        elementCount: Array.isArray(document.elements) ? document.elements.length : 0,
    };
}
