import { create } from 'zustand';

/**
 * Whether the people on the other end are seeing this drawing change.
 *
 * Deliberately not the same question as whether the drawing is saved. The autosave writes the
 * snapshot; this says whether edits are reaching anybody live. They fail apart: a socket can
 * drop while saves keep going, and somebody who is told "saved" would otherwise carry on
 * believing the person they are working with can see them.
 *
 * `off` is a build with no socket at all — a fresh clone, or CI — and it says nothing, because
 * there is nobody to be disconnected from.
 */

export type CollaborationStatus = 'off' | 'live' | 'offline';

interface CollaborationStore {
    status: CollaborationStatus;
    /** Edits made while the socket was down, still waiting to be sent. */
    waiting: number;

    setStatus: (status: CollaborationStatus) => void;
    setWaiting: (waiting: number) => void;
    reset: () => void;
}

export const useCollaborationStore = create<CollaborationStore>()((set) => ({
    status: 'off',
    waiting: 0,

    setStatus: (status) => set({ status }),
    setWaiting: (waiting) => set({ waiting }),
    reset: () => set({ status: 'off', waiting: 0 }),
}));
