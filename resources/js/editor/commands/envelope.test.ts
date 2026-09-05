import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createLine, createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument, WallElement } from '@/editor/model/types';

import {
    addElements,
    coalesce,
    combine,
    deleteElements,
    replaceDocument,
    replaceElements,
    replaceLayers,
    replaceSettings,
    replaceSheets,
    type Command,
} from './command';
import { parseCommand } from './envelope';

/**
 * The round trip is the whole point, so it is the whole test.
 *
 * A command that survives being written out as JSON and read back somewhere else is a command
 * that can be sent to another editor or handed to a plugin. What proves that is not the shape
 * of the envelope but the behaviour of what comes out of it: run the rebuilt command against
 * the same drawing, and it has to land in exactly the same place — undo included.
 */

const LAYER = 'layer_architecture';
const MADE_AT = { createdAt: '2026-03-14T09:00:00.000Z' };

function wall(id: string, to = point(4000, 0)): WallElement {
    return { ...createWall(point(0, 0), to, LAYER, 150), id, metadata: MADE_AT };
}

function line(id: string): Element {
    return { ...createLine(point(0, 0), point(1000, 1000), LAYER), id, metadata: MADE_AT };
}

function documentWith(elements: Element[]): HashiraDocument {
    return { ...emptyDocument('Ground floor'), id: 'doc', elements };
}

/** Down the wire and back: JSON is the only thing that actually travels. */
function overTheWire(command: Command): Command {
    const json: unknown = JSON.parse(JSON.stringify(command.describe()));
    const parsed = parseCommand(json);

    if (!parsed.ok) {
        throw new Error(`the envelope would not parse: ${parsed.reason}`);
    }

    return parsed.command;
}

/**
 * The rebuilt command has to do what the original does, both ways, against the same drawing.
 * Each side runs its own copy, because a delete captures where things were as it goes.
 */
function behavesTheSame(command: Command, document: HashiraDocument) {
    const rebuilt = overTheWire(command);

    const done = command.execute(document);
    const doneAgain = rebuilt.execute(document);

    expect(doneAgain).toEqual(done);
    expect(rebuilt.undo(doneAgain)).toEqual(command.undo(done));
    expect(rebuilt.label).toBe(command.label);
    expect(rebuilt.coalesceKey).toBe(command.coalesceKey);
}

describe('a command over the wire', () => {
    it('carries elements that were drawn', () => {
        behavesTheSame(addElements([line('l1')], 'Wall'), documentWith([wall('w1')]));
    });

    it('carries a delete, and puts things back where they were', () => {
        const document = documentWith([wall('w1'), line('l1'), wall('w2', point(0, 3000))]);

        // The middle one: undo has to restore paint order, not append.
        behavesTheSame(deleteElements(['l1'], 'Delete'), document);
    });

    it('carries an edit, with the key that merges it into the one before', () => {
        const before = wall('w1');
        const after = { ...before, geometry: { ...before.geometry, thickness: 300 } };

        behavesTheSame(
            replaceElements([before], [after], 'Thickness', 'thickness:w1'),
            documentWith([before]),
        );
    });

    it('carries a layer change', () => {
        const document = documentWith([]);
        const after = document.layers.map((layer) =>
            layer.id === LAYER ? { ...layer, visible: false } : layer,
        );

        behavesTheSame(replaceLayers(document.layers, after, 'Layer visibility'), document);
    });

    it('carries a sheet change', () => {
        const document = documentWith([]);
        const after = document.settings.sheets.map((sheet) => ({ ...sheet, scale: 100 }));

        behavesTheSame(replaceSheets(document.settings.sheets, after, 'Sheet scale'), document);
    });

    it('carries a settings change', () => {
        const document = documentWith([]);
        const after = { ...document.settings, unit: 'cm' as const, scale: 20 };

        behavesTheSame(replaceSettings(document.settings, after, 'Settings'), document);
    });

    it('carries a whole drawing, which is what restoring a version is', () => {
        const before = documentWith([wall('w1')]);
        const after = documentWith([wall('w1'), line('l1')]);

        behavesTheSame(replaceDocument(before, after, 'Restore version'), before);
    });

    it('carries the parts of a combined edit, in order', () => {
        const document = documentWith([wall('w1')]);
        const command = combine('Import', [
            addElements([line('l1')], 'Add'),
            deleteElements(['w1'], 'Delete'),
        ]);

        behavesTheSame(command, document);
    });

    it('carries a combination nested inside a combination', () => {
        const document = documentWith([wall('w1')]);
        const command = combine('Outer', [
            combine('Inner', [addElements([line('l1')], 'Add')]),
            addElements([wall('w2', point(0, 3000))], 'Add'),
        ]);

        behavesTheSame(command, document);
    });

    it('carries a merged edit as the one edit it became', () => {
        const start = wall('w1');
        const middle = { ...start, geometry: { ...start.geometry, thickness: 200 } };
        const end = { ...start, geometry: { ...start.geometry, thickness: 400 } };

        const merged = coalesce(
            replaceElements([start], [middle], 'Thickness', 'thickness:w1'),
            replaceElements([middle], [end], 'Thickness', 'thickness:w1'),
        );

        expect(merged).not.toBeNull();

        if (merged === null) return;

        // A single undo still has to return to where the whole run began, on the far side too.
        behavesTheSame(merged, documentWith([start]));
    });
});

describe('an envelope from somewhere else', () => {
    it('is refused when it is not an edit at all', () => {
        expect(parseCommand(null).ok).toBe(false);
        expect(parseCommand('Delete').ok).toBe(false);
        expect(parseCommand({}).ok).toBe(false);
    });

    it('is refused when it names an edit that does not exist', () => {
        const result = parseCommand({ type: 'dropDatabase', label: 'Tidy up' });

        expect(result.ok).toBe(false);
    });

    it('is refused when an element inside it is not an element', () => {
        const result = parseCommand({
            type: 'addElements',
            label: 'Add',
            elements: [{ id: 'x', type: 'wall', layerId: LAYER, geometry: { thickness: -5 } }],
        });

        expect(result.ok).toBe(false);

        if (result.ok) return;

        // The message says which part, because "invalid" on a wire is not a bug report.
        expect(result.reason).toContain('elements');
    });

    it('is refused when the label is longer than a history menu', () => {
        const result = parseCommand({
            type: 'deleteElements',
            label: 'x'.repeat(500),
            ids: ['w1'],
        });

        expect(result.ok).toBe(false);
    });

    it('is refused when a nested edit is broken, however deep', () => {
        const result = parseCommand({
            type: 'combine',
            label: 'Import',
            commands: [{ type: 'combine', label: 'Inner', commands: [{ type: 'nonsense' }] }],
        });

        expect(result.ok).toBe(false);
    });

    it('fills in settings a sender left out rather than storing a hole', () => {
        const result = parseCommand({
            type: 'replaceSettings',
            label: 'Settings',
            before: {},
            after: { unit: 'cm' },
        });

        expect(result.ok).toBe(true);

        if (!result.ok) return;

        const settings = result.command.execute(documentWith([])).settings;

        expect(settings.unit).toBe('cm');
        // Never sent, and a drawing cannot be without one.
        expect(settings.grid.size).toBeGreaterThan(0);
        expect(settings.sheets).toHaveLength(1);
    });

    it('migrates a drawing sent by an older build', () => {
        const old = { ...documentWith([wall('w1')]), schemaVersion: 4 };

        const result = parseCommand({
            type: 'replaceDocument',
            label: 'Restore version',
            before: documentWith([]),
            after: old,
        });

        expect(result.ok).toBe(true);

        if (!result.ok) return;

        // Read by the document parser, migrations and all, so it arrives as this build's schema.
        expect(result.command.execute(documentWith([])).schemaVersion).toBeGreaterThan(4);
    });
});

/**
 * The inverse, down the wire and back. An undo has to leave this browser as an edit like any
 * other, so what matters is that the described opposite, rebuilt somewhere else and run
 * against that copy, lands on the drawing the edit started from.
 */
function undoesOverTheWire(command: Command, document: HashiraDocument) {
    const done = command.execute(document);

    const json: unknown = JSON.parse(JSON.stringify(command.describeInverse()));
    const parsed = parseCommand(json);

    if (!parsed.ok) {
        throw new Error(`the inverse would not parse: ${parsed.reason}`);
    }

    expect(parsed.command.execute(done)).toEqual(document);
}

describe('an undo, sent to somebody else', () => {
    it('takes back an add', () => {
        undoesOverTheWire(addElements([line('a')]), documentWith([wall('w')]));
    });

    /*
     * The one that is not a mirror image. Paint order within a layer is array order, so
     * putting elements back at the end would restack the drawing for whoever received the
     * undo — and the two people would be looking at different plans.
     */
    it('puts a deleted element back where it was, not at the end', () => {
        const document = documentWith([line('a'), wall('w'), line('b')]);
        const command = deleteElements(['w']);

        undoesOverTheWire(command, document);

        const done = command.execute(document);
        const parsed = parseCommand(JSON.parse(JSON.stringify(command.describeInverse())));

        if (!parsed.ok) throw new Error(parsed.reason);

        expect(parsed.command.execute(done).elements.map((element) => element.id)).toEqual([
            'a',
            'w',
            'b',
        ]);
    });

    it('takes back an edit by swapping the two states it sat between', () => {
        const before = wall('w');
        const after = wall('w', point(6000, 0));

        undoesOverTheWire(
            replaceElements([before], [after], 'Move'),
            documentWith([before, line('a')]),
        );
    });

    it('takes back the parts of a combined edit, backwards', () => {
        const document = documentWith([wall('w')]);

        undoesOverTheWire(
            combine('Import', [addElements([line('a')]), deleteElements(['w'])]),
            document,
        );
    });

    it('is itself undoable, so a restore can be taken back too', () => {
        const document = documentWith([line('a'), wall('w')]);
        const command = deleteElements(['w']);
        const done = command.execute(document);

        const parsed = parseCommand(JSON.parse(JSON.stringify(command.describeInverse())));

        if (!parsed.ok) throw new Error(parsed.reason);

        const restored = parsed.command.execute(done);

        expect(parsed.command.undo(restored)).toEqual(done);
    });
});
