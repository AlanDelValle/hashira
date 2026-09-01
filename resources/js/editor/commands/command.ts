import type {
    DocumentSettings,
    Element,
    HashiraDocument,
    Layer,
    Sheet,
} from '@/editor/model/types';

import type { CommandEnvelope } from './envelope';

/**
 * The only way the document changes.
 *
 * A command is a pure function of the document and its own captured state: `execute` returns
 * the next document, `undo` returns the previous one. Nothing mutates in place, so undo is
 * exact by construction rather than by remembering to snapshot.
 *
 * A command is also a *closure*, which is the one thing it cannot be when it has to leave this
 * process — for another person's editor, or for a plugin running in a sandbox. `describe`
 * is the way out: plain JSON that says what the edit is, with `parseCommand` in `envelope.ts`
 * as the way back in. See that file for why there is only one way back in.
 */
export interface Command {
    readonly label: string;

    /**
     * Commands sharing a key describe one edit continuing — nudging an element with the arrow
     * keys, or dragging a number field. The history merges those rather than filling itself
     * with sixty single-millimetre steps. A null key never merges.
     */
    readonly coalesceKey: string | null;

    execute(document: HashiraDocument): HashiraDocument;
    undo(document: HashiraDocument): HashiraDocument;

    /** This edit as plain JSON, for anything that has to send it somewhere. */
    describe(): CommandEnvelope;
}

/** A command that swaps elements for edited copies: a move, a rotation, a property edit. */
export interface ReplaceCommand extends Command {
    readonly kind: 'replace';
    readonly before: readonly Element[];
    readonly after: readonly Element[];
}

export function isReplaceCommand(command: Command): command is ReplaceCommand {
    return 'kind' in command && command.kind === 'replace';
}

function withElements(document: HashiraDocument, elements: Element[]): HashiraDocument {
    return { ...document, elements };
}

export function addElements(added: readonly Element[], label = 'Add'): Command {
    const ids = new Set(added.map((element) => element.id));

    return {
        label,
        coalesceKey: null,

        execute: (document) => withElements(document, [...document.elements, ...added]),

        undo: (document) =>
            withElements(
                document,
                document.elements.filter((element) => !ids.has(element.id)),
            ),

        describe: () => ({ type: 'addElements', label, elements: [...added] }),
    };
}

export function deleteElements(ids: readonly string[], label = 'Delete'): Command {
    const removing = new Set(ids);

    // Captured on execute so undo can put each element back where it was: paint order within
    // a layer is array order, and a delete must not quietly restack the drawing.
    let removed: { index: number; element: Element }[] = [];

    return {
        label,
        coalesceKey: null,

        execute(document) {
            removed = document.elements.flatMap((element, index) =>
                removing.has(element.id) ? [{ index, element }] : [],
            );

            return withElements(
                document,
                document.elements.filter((element) => !removing.has(element.id)),
            );
        },

        undo(document) {
            const elements = [...document.elements];

            // Ascending, so each splice lands on an index the earlier ones have already made
            // room for.
            for (const { index, element } of [...removed].sort((a, b) => a.index - b.index)) {
                elements.splice(Math.min(index, elements.length), 0, element);
            }

            return withElements(document, elements);
        },

        /*
         * Only the ids travel, never `removed`.
         *
         * What a delete has to say is which elements go; what it needs in order to *undo* is
         * where they were, and that is a fact about the document it ran against. Somewhere
         * else, running against its own copy, it captures its own — which is the only version
         * that would put them back in the right order there.
         */
        describe: () => ({ type: 'deleteElements', label, ids: [...ids] }),
    };
}

/**
 * Replace elements with edited copies, leaving their position in the array alone.
 *
 * `before` and `after` describe the same ids: the state the edit started from, and the state
 * it produced.
 */
export function replaceElements(
    before: readonly Element[],
    after: readonly Element[],
    label: string,
    coalesceKey: string | null = null,
): ReplaceCommand {
    function swap(document: HashiraDocument, replacements: readonly Element[]): HashiraDocument {
        const byId = new Map(replacements.map((element) => [element.id, element]));

        return withElements(
            document,
            document.elements.map((element) => byId.get(element.id) ?? element),
        );
    }

    return {
        kind: 'replace',
        label,
        coalesceKey,
        before,
        after,

        execute: (document) => swap(document, after),
        undo: (document) => swap(document, before),

        describe: () => ({
            type: 'replaceElements',
            label,
            coalesceKey,
            before: [...before],
            after: [...after],
        }),
    };
}

/**
 * Fold a continuing edit into the one already on the history, keeping the original `before`
 * so that a single undo returns to where the edit started. Returns null when the two are
 * separate edits and both belong on the stack.
 */
export function coalesce(previous: Command, next: Command): Command | null {
    if (
        previous.coalesceKey === null ||
        previous.coalesceKey !== next.coalesceKey ||
        !isReplaceCommand(previous) ||
        !isReplaceCommand(next)
    ) {
        return null;
    }

    return replaceElements(previous.before, next.after, next.label, next.coalesceKey);
}

/**
 * Replace the layer list.
 *
 * Layer visibility, locking and order live in the document, so changing one is an edit like
 * any other — and undoable like any other. Hiding a layer by mistake is exactly the kind of
 * thing someone reaches for Ctrl+Z after.
 */
export function replaceLayers(
    before: readonly Layer[],
    after: readonly Layer[],
    label: string,
): Command {
    return {
        label,
        coalesceKey: null,
        execute: (document) => ({ ...document, layers: [...after] }),
        undo: (document) => ({ ...document, layers: [...before] }),

        describe: () => ({
            type: 'replaceLayers',
            label,
            before: [...before],
            after: [...after],
        }),
    };
}

/**
 * Replace the sheet list.
 *
 * Adding a page, moving one over a different part of the plan, changing what it is plotted at
 * — all of it is an edit to the drawing and undoable like any other. A sheet holds no
 * geometry, but deleting one throws away a decision about how the drawing is presented, and
 * that is exactly the kind of thing Ctrl+Z is for.
 */
export function replaceSheets(
    before: readonly Sheet[],
    after: readonly Sheet[],
    label: string,
): Command {
    function withSheets(document: HashiraDocument, sheets: readonly Sheet[]): HashiraDocument {
        return { ...document, settings: { ...document.settings, sheets: [...sheets] } };
    }

    return {
        label,
        coalesceKey: null,
        execute: (document) => withSheets(document, after),
        undo: (document) => withSheets(document, before),

        describe: () => ({
            type: 'replaceSheets',
            label,
            before: [...before],
            after: [...after],
        }),
    };
}

/**
 * Replace the settings.
 *
 * What a title block says is part of the drawing and belongs in its history like anything
 * else: a revision letter typed into the wrong field is exactly what Ctrl+Z is for.
 */
export function replaceSettings(
    before: DocumentSettings,
    after: DocumentSettings,
    label: string,
): Command {
    return {
        label,
        coalesceKey: null,
        execute: (document) => ({ ...document, settings: after }),
        undo: (document) => ({ ...document, settings: before }),

        describe: () => ({ type: 'replaceSettings', label, before, after }),
    };
}

/**
 * Several edits as one, undone in one.
 *
 * Importing a drawing adds elements *and* the layers they land on; doing that as two commands
 * would mean two presses of Ctrl+Z, and a press in between that leaves elements on layers
 * that no longer exist. Undo runs the parts backwards, which is the only order that returns
 * the document to where it started.
 */
export function combine(label: string, commands: readonly Command[]): Command {
    return {
        label,
        coalesceKey: null,

        execute: (document) => commands.reduce((current, step) => step.execute(current), document),

        undo: (document) =>
            [...commands].reverse().reduce((current, step) => step.undo(current), document),

        describe: () => ({
            type: 'combine',
            label,
            commands: commands.map((step) => step.describe()),
        }),
    };
}

/**
 * Replace the whole drawing — restoring a saved version.
 *
 * Deliberately a command like any other, so going back to a version is undoable. Restoring is
 * a decision someone can regret, and the drawing they left is one Ctrl+Z away rather than
 * gone.
 */
export function replaceDocument(
    before: HashiraDocument,
    after: HashiraDocument,
    label: string,
): Command {
    return {
        label,
        coalesceKey: null,
        execute: () => after,
        undo: () => before,

        /*
         * Two whole drawings, which is what restoring a version actually is. It is the one
         * envelope big enough to be worth thinking twice about putting on a live channel: a
         * restore is a thing to announce, not a thing to stream.
         */
        describe: () => ({ type: 'replaceDocument', label, before, after }),
    };
}
