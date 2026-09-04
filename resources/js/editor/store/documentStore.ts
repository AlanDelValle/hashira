import { create } from 'zustand';

import { HistoryStack } from '@/editor/commands/history';
import type { Command } from '@/editor/commands/command';
import { emptyDocument, parseDocument, type DroppedElement } from '@/editor/model/document';
import type { HashiraDocument } from '@/editor/model/types';

/**
 * The document, and the only door onto it.
 *
 * The store is a container, not the model: what it holds is the same plain, serialisable
 * structure the API sends. Nothing outside `history` may call `setDocument` — every edit is a
 * command, which is what makes undo exact.
 */

interface DocumentStore {
    document: HashiraDocument;
    /** Elements the parser had to discard on load, so the UI can say so once. */
    dropped: DroppedElement[];
    /** Set when a drawing could not be opened at all. */
    error: string | null;

    /** Replace the document wholesale. Reserved for the history and for loading. */
    setDocument: (document: HashiraDocument) => void;
    load: (raw: unknown) => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
    document: emptyDocument(),
    dropped: [],
    error: null,

    setDocument: (document) => set({ document }),

    load: (raw) => {
        const result = parseDocument(raw);

        if (!result.ok) {
            set({ error: result.reason, dropped: [] });

            return;
        }

        set({ document: result.document, dropped: result.dropped, error: null });
        history.clear();
    },
}));

export const history = new HistoryStack({
    get: () => useDocumentStore.getState().document,
    set: (document) => useDocumentStore.setState({ document }),
});

/**
 * Whoever wants to know what was just edited here.
 *
 * A listener rather than a direct call into the collaboration module, because that module
 * already reads this one — `history` lives here — and two files importing each other is a
 * circle that works until the day the bundler decides which half to evaluate first.
 */
let observer: ((command: Command) => void) | null = null;

export function observeCommands(listener: (command: Command) => void): () => void {
    observer = listener;

    return () => {
        if (observer === listener) {
            observer = null;
        }
    };
}

/**
 * Run an edit. Every mutation in the application funnels through this one call — which is why
 * it is also the one place that knows an edit is worth telling anybody else about.
 *
 * Only edits made *here* come through here. Somebody else's arrives through `history.apply`,
 * which deliberately does not come back out this way: an edit must not be logged twice, and a
 * foreign edit is not ours to undo.
 */
export function runCommand(command: Command): void {
    history.execute(command);
    observer?.(command);
}
