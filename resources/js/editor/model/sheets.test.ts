import { describe, expect, it } from 'vitest';

import { replaceSheets } from '@/editor/commands/command';

import { emptyDocument } from './document';
import { createSheet, duplicateSheet, nextSheetName, resolveSheet } from './sheets';
import type { Sheet } from './types';

function sheet(id: string, name: string, centre: Sheet['centre'] = null): Sheet {
    return { id, name, size: 'A3', orientation: 'landscape', scale: 50, centre };
}

describe('naming a sheet', () => {
    it('numbers a new one past whatever is already there', () => {
        expect(nextSheetName([])).toBe('Sheet 1');
        expect(nextSheetName([sheet('a', 'Sheet 1'), sheet('b', 'Sheet 2')])).toBe('Sheet 3');
    });

    /*
     * Sheets are referred to by name on a print and in a conversation about one, so two of
     * them answering to "Sheet 2" is a real problem rather than an untidy one.
     */
    it('skips a number somebody has already used for something else', () => {
        expect(nextSheetName([sheet('a', 'Sheet 2')])).toBe('Sheet 1');
        expect(nextSheetName([sheet('a', 'Sheet 1'), sheet('b', 'Sheet 3')])).toBe('Sheet 2');
    });
});

describe('adding a sheet', () => {
    it('starts out framing the whole drawing, as the first sheet does', () => {
        expect(createSheet([], { scale: 50 }).centre).toBeNull();
    });

    it('is a page of its own, not a second name for the one it was copied from', () => {
        const original = sheet('a', 'Ground floor', { x: 1000, y: 2000 });
        const copy = duplicateSheet(original, [original]);

        expect(copy.id).not.toBe(original.id);
        expect(copy.name).toBe('Ground floor copy');

        // Copied rather than shared: moving one page must not move the other.
        expect(copy.centre).toEqual({ x: 1000, y: 2000 });
        expect(copy.centre).not.toBe(original.centre);
    });
});

describe('the sheet being worked on', () => {
    const sheets = [sheet('a', 'Sheet 1'), sheet('b', 'Sheet 2')];

    it('is the one asked for', () => {
        expect(resolveSheet(sheets, 'b')?.name).toBe('Sheet 2');
    });

    /*
     * Which sheet somebody is looking at is not saved with the drawing, so the id outlives the
     * sheet — reopening a plan, or undoing the deletion of one. Falling back to the first page
     * keeps that from being an error every caller has to handle.
     */
    it('is the first one when the id refers to a sheet that is not there', () => {
        expect(resolveSheet(sheets, 'gone')?.name).toBe('Sheet 1');
        expect(resolveSheet(sheets, null)?.name).toBe('Sheet 1');
        expect(resolveSheet([], 'a')).toBeUndefined();
    });
});

describe('changing the sheets', () => {
    it('undoes, because deleting a page is a decision somebody can regret', () => {
        const drawing = emptyDocument('Plan');
        const before = drawing.settings.sheets;
        const command = replaceSheets(before, [...before, sheet('b', 'Sheet 2')], 'Add sheet');

        const added = command.execute(drawing);

        expect(added.settings.sheets).toHaveLength(2);
        expect(command.undo(added).settings.sheets).toEqual(before);

        // The rest of the settings come through untouched: a page is not the drawing.
        expect(added.settings.grid).toEqual(drawing.settings.grid);
    });
});
