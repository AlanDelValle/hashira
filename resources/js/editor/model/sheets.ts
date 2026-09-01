import { newId } from './id';
import type { Sheet, SheetOrientation, SheetSize } from './types';

/**
 * Making and finding sheets.
 *
 * A sheet is the smallest object in the document — a page size, a scale and a place to look
 * — so most of what there is to say about one is said here rather than spread across the
 * panel that edits it.
 */

/** What a drawing's first sheet is, and what a new one inherits when nothing says otherwise. */
export const DEFAULT_SHEET_SIZE: SheetSize = 'A3';
export const DEFAULT_SHEET_ORIENTATION: SheetOrientation = 'landscape';

export interface SheetDefaults {
    size?: SheetSize;
    orientation?: SheetOrientation;
    scale: number;
}

/**
 * A name nothing else in the drawing is already called.
 *
 * Sheets are referred to by name on a print and in a conversation about one, so two called
 * "Sheet 2" is a real problem rather than an untidy one.
 */
export function nextSheetName(existing: readonly Sheet[]): string {
    const taken = new Set(existing.map((sheet) => sheet.name));

    for (let index = 1; ; index++) {
        const candidate = `Sheet ${index}`;

        if (!taken.has(candidate)) {
            return candidate;
        }
    }
}

/** A wanted name, numbered only if something already answers to it. */
export function uniqueSheetName(wanted: string, existing: readonly Sheet[]): string {
    const taken = new Set(existing.map((sheet) => sheet.name));

    if (!taken.has(wanted)) {
        return wanted;
    }

    for (let index = 2; ; index++) {
        const candidate = `${wanted} ${index}`;

        if (!taken.has(candidate)) {
            return candidate;
        }
    }
}

/** A new sheet, framing the whole drawing until somebody puts it somewhere. */
export function createSheet(existing: readonly Sheet[], defaults: SheetDefaults): Sheet {
    return {
        id: newId(),
        name: nextSheetName(existing),
        size: defaults.size ?? DEFAULT_SHEET_SIZE,
        orientation: defaults.orientation ?? DEFAULT_SHEET_ORIENTATION,
        scale: defaults.scale,
        centre: null,
    };
}

/** A copy of a sheet, under a name of its own — the same page looking at the same place. */
export function duplicateSheet(sheet: Sheet, existing: readonly Sheet[]): Sheet {
    return {
        ...sheet,
        id: newId(),
        name: uniqueSheetName(`${sheet.name} copy`, existing),
        centre: sheet.centre === null ? null : { ...sheet.centre },
    };
}

/**
 * The sheet an id refers to, or the first one.
 *
 * Which sheet is being looked at belongs to the person editing rather than to the drawing, so
 * the id can outlive the sheet — reopening a drawing, or undoing the delete of one. Falling
 * back to the first sheet keeps that from being an error anybody has to handle.
 */
export function resolveSheet(sheets: readonly Sheet[], id: string | null): Sheet | undefined {
    return sheets.find((sheet) => sheet.id === id) ?? sheets[0];
}
