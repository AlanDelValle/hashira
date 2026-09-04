import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, emptyTitleBlock, mergeSettings, parseDocument } from './document';

/**
 * Reading the settings of a drawing that is not perfectly written.
 *
 * The settings used to be parsed as one object, in one call, with the whole thing thrown away
 * and replaced by the defaults if any part of it failed — so a drawing lost its unit, its
 * scale, its grid, its snapping, its title, its title block and its notes together, on load,
 * silently, and autosave then wrote the defaults back over what it had said. Only `sheets`
 * survived, because `resolveSheets` reads it from the raw object and drops a page at a time.
 *
 * `tests/fixtures/nulled-document.json` is what made that happen in practice, and it is a
 * real row: the autosave endpoint ran under Laravel's ConvertEmptyStringsToNull until
 * 2026-09-04, so every empty string a drawing was saved with came back as null. The server
 * suite reads the same file, as a row to be repaired; this side reads it as a drawing.
 */
const nulled: unknown = JSON.parse(
    // From the project root rather than from this module: these run under jsdom, where
    // `import.meta.url` is not a file URL. The same route blankDocument.test.ts takes.
    readFileSync(join(process.cwd(), 'tests/fixtures/nulled-document.json'), 'utf8'),
);

describe('a drawing that came back with nulls in it', () => {
    const result = parseDocument(nulled);
    const settings = result.ok ? result.document.settings : DEFAULT_SETTINGS;

    it('keeps every setting that is still readable', () => {
        expect(result.ok).toBe(true);

        expect(settings.unit).toBe('cm');
        expect(settings.scale).toBe(100);
        expect(settings.grid).toEqual({ size: 250, subdivisions: 4, visible: false, snap: true });
        expect(settings.snapping.midpoint).toBe(false);
        expect(settings.title).toBe('Garage');
        expect(settings.sheets).toHaveLength(1);
        expect(settings.sheets[0]?.size).toBe('A2');
    });

    it('reads a null field as the blank it was', () => {
        expect(settings.titleBlock).toEqual({
            project: 'Maltings, unit 4',
            client: '',
            drawnBy: '',
            revision: '',
            date: '',
        });

        expect(settings.notes).toBe('');
    });

    /*
     * The one thing tolerance cannot reach. `content` is not nullable and should not become
     * so — a text element with no content is not a text element — so the label is dropped
     * here, and would then be autosaved out of the drawing. It is put back in the database by
     * the repair the server suite covers (App\Domain\Documents\EmptiedStrings), which is why
     * that migration exists at all rather than the reader simply coping.
     */
    it('still drops a label whose content came back as null', () => {
        expect(result.ok && result.document.elements.map((element) => element.id)).toEqual([
            'el_wall',
        ]);

        expect(result.ok && result.dropped).toHaveLength(1);
    });
});

describe('reading the settings a field at a time', () => {
    it('lets one unreadable field cost only itself', () => {
        const settings = mergeSettings(
            {
                unit: 'cm',
                scale: 100,
                notes: 'A note somebody typed',
                title: 'Garage',
                grid: { size: 250, subdivisions: 'four', visible: false, snap: true },
                titleBlock: { project: 'Garage', client: null },
            },
            'fallback',
        );

        expect(settings.unit).toBe('cm');
        expect(settings.scale).toBe(100);
        expect(settings.title).toBe('Garage');
        expect(settings.notes).toBe('A note somebody typed');
        expect(settings.titleBlock.project).toBe('Garage');
        expect(settings.titleBlock.client).toBe('');

        // Only the field nobody could read falls back, and the three beside it in the same
        // object do not go with it.
        expect(settings.grid).toEqual({
            size: 250,
            subdivisions: DEFAULT_SETTINGS.grid.subdivisions,
            visible: false,
            snap: true,
        });
    });

    it('fills in a drawing that says nothing at all', () => {
        expect(mergeSettings(undefined, 'Untitled')).toEqual({
            ...DEFAULT_SETTINGS,
            title: 'Untitled',
            titleBlock: emptyTitleBlock(),
        });

        expect(mergeSettings('not settings', 'Untitled').unit).toBe(DEFAULT_SETTINGS.unit);
        expect(mergeSettings(null, 'Untitled').scale).toBe(DEFAULT_SETTINGS.scale);
        expect(mergeSettings([], 'Untitled').notes).toBe('');
    });

    it('does not take a nonsense value at its word', () => {
        const settings = mergeSettings(
            {
                unit: 'furlongs',
                scale: -1,
                grid: { size: 0, subdivisions: 99 },
                snapping: { enabled: 'yes' },
                title: 42,
                notes: ['a note'],
                titleBlock: 'Maltings',
            },
            'fallback',
        );

        expect(settings.unit).toBe(DEFAULT_SETTINGS.unit);
        expect(settings.scale).toBe(DEFAULT_SETTINGS.scale);
        expect(settings.grid).toEqual(DEFAULT_SETTINGS.grid);
        expect(settings.snapping.enabled).toBe(DEFAULT_SETTINGS.snapping.enabled);
        expect(settings.title).toBe('fallback');
        expect(settings.notes).toBe('');
        expect(settings.titleBlock).toEqual(emptyTitleBlock());
    });
});
