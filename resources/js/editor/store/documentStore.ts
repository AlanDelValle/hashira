import { create } from 'zustand';

import { HistoryStack } from '@/editor/commands/history';
import type { Command } from '@/editor/commands/command';
import type { CommandEnvelope } from '@/editor/commands/envelope';
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
 * Hear about every edit made here, as plain JSON.
 *
 * Forwarded from the history rather than announced from `runCommand`, because undoing is an
 * edit too — it changes the drawing, and everybody else has to see the change. What arrives
 * for an undo is the *inverse* of the local command, not a rewind of a shared stack.
 *
 * A listener rather than a direct call into the collaboration module, because that module
 * already reads this one — `history` lives here — and two files importing each other is a
 * circle that works until the day the bundler decides which half to evaluate first.
 */
export function observeEdits(listener: (envelope: CommandEnvelope) => void): () => void {
    return history.observe(listener);
}

/** Run an edit. Every mutation in the application funnels through this one call. */
export function runCommand(command: Command): void {
    history.execute(command);
}
