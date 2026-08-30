import type { Element, HashiraDocument, Layer } from '@/editor/model/types';

/**
 * The only way the document changes.
 *
 * A command is a pure function of the document and its own captured state: `execute` returns
 * the next document, `undo` returns the previous one. Nothing mutates in place, so undo is
 * exact by construction rather than by remembering to snapshot, and the same objects are what
 * a future collaboration or scripting layer would send over a wire.
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
    };
}
