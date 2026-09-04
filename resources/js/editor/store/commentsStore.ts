import { create } from 'zustand';

import type { CommentPin } from '@/editor/render/comments';
import type { CommentThread } from '@/types/api';

/**
 * The conversations on the drawing that is open.
 *
 * A store rather than component state, because two very different things read it: the panel
 * beside the drawing, which is React, and the render loop, which is not. The renderer reads it
 * with `getState()` on the frame it paints, the same way it reads the document.
 *
 * Nothing here is part of the document. Comments are not drawn, not undone, not exported and
 * not compared between versions — see roadmap.md, Phase 9. They arrive from the server when a
 * project opens and are written straight back when somebody says something.
 */

interface CommentsStore {
    threads: CommentThread[];
    /** Which thread the panel has open, and which pin is ringed on the drawing. */
    selectedId: string | null;
    /** True while the first fetch for this project is in flight. */
    loading: boolean;
    /** Set when the list could not be fetched; the panel says so rather than looking empty. */
    error: string | null;

    load: (threads: CommentThread[]) => void;
    fail: (message: string) => void;
    begin: () => void;
    clear: () => void;

    /** Add or replace one thread, keeping the server's own ordering rule. */
    put: (thread: CommentThread) => void;
    remove: (threadId: string) => void;
    select: (threadId: string | null) => void;
}

/**
 * Open threads first, then newest first — the same order the server returns, applied again
 * here so a thread that has just been resolved moves without a round trip.
 */
function inReadingOrder(threads: CommentThread[]): CommentThread[] {
    return [...threads].sort((a, b) => {
        if (a.resolved !== b.resolved) {
            return a.resolved ? 1 : -1;
        }

        return b.createdAt.localeCompare(a.createdAt);
    });
}

export const useCommentsStore = create<CommentsStore>()((set) => ({
    threads: [],
    selectedId: null,
    loading: false,
    error: null,

    begin: () => set({ loading: true, error: null }),
    load: (threads) => set({ threads: inReadingOrder(threads), loading: false, error: null }),
    fail: (message) => set({ loading: false, error: message }),
    clear: () => set({ threads: [], selectedId: null, loading: false, error: null }),

    put: (thread) =>
        set((state) => ({
            threads: inReadingOrder([
                ...state.threads.filter((one) => one.id !== thread.id),
                thread,
            ]),
        })),

    remove: (threadId) =>
        set((state) => ({
            threads: state.threads.filter((one) => one.id !== threadId),
            selectedId: state.selectedId === threadId ? null : state.selectedId,
        })),

    select: (threadId) => set({ selectedId: threadId }),
}));

/**
 * The pins to paint, numbered by when each was raised.
 *
 * The number is worked out from creation order rather than from the list's order, so it does
 * not change under somebody the moment a thread is resolved — the number beside their words
 * has to still be the number on the drawing tomorrow.
 */
export function commentPins(threads: readonly CommentThread[]): CommentPin[] {
    const byAge = [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const numbers = new Map(byAge.map((thread, index) => [thread.id, index + 1]));

    return threads.map((thread) => ({
        id: thread.id,
        at: { x: thread.x, y: thread.y },
        resolved: thread.resolved,
        number: numbers.get(thread.id) ?? 0,
    }));
}
