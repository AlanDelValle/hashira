import { create } from 'zustand';

import { echo } from '@/editor/presence/echo';
import type { Mention } from '@/types/api';

import { fetchMentions } from './mentions';

/**
 * What you have been asked about, and have not looked at yet.
 *
 * App-level rather than part of the editor: the whole point of a mention is reaching somebody
 * who is *not* looking at the drawing it is on, so it has to survive leaving that drawing.
 *
 * The list is fetched once when somebody signs in and refetched when the socket says there is
 * something new. With no socket it is simply what was there at sign-in — which is the same
 * bargain presence makes, and the same reason: a build without a websocket server must work,
 * just more quietly.
 */

interface MentionsStore {
    mentions: Mention[];
    load: () => Promise<void>;
    forget: (id: string) => void;
    clear: () => void;
}

export const useMentionsStore = create<MentionsStore>()((set) => ({
    mentions: [],

    load: async () => {
        try {
            set({ mentions: await fetchMentions() });
        } catch {
            /* An inbox that will not load is an inbox that stays as it was. */
        }
    },

    forget: (id) => set((state) => ({ mentions: state.mentions.filter((one) => one.id !== id) })),
    clear: () => set({ mentions: [] }),
}));

let listening: (() => void) | null = null;

/**
 * Listen on this account's own channel. A mention arrives as a nudge with an id in it and
 * nothing else — the list is asked for again rather than patched from the message, because the
 * server already knows how to answer "what have I not seen", and two ways of building that
 * answer is one too many.
 */
export function watchMentions(userId: number): void {
    stopWatchingMentions();

    const client = echo();

    void useMentionsStore.getState().load();

    if (client === null) {
        return;
    }

    const channel = client.private(`user.${userId}`);

    channel.listen('.mention.received', () => {
        void useMentionsStore.getState().load();
    });

    listening = () => client.leave(`user.${userId}`);
}

export function stopWatchingMentions(): void {
    listening?.();
    listening = null;
    useMentionsStore.getState().clear();
}
