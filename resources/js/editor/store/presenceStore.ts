import { create } from 'zustand';

/**
 * Who else is looking at this drawing.
 *
 * Membership changes when somebody opens or closes the project, which is rare, so this is a
 * store and React reads it — the strip of names in the header. Where their pointers are is a
 * different thing entirely and deliberately not here: that arrives at pointer rate and lives
 * in a plain object the render loop reads, because rule 5 says a moving pointer costs no
 * renders. See `presence/presence.ts`.
 *
 * What a member is, is exactly what `routes/channels.php` returned when it authorized them: a
 * name and an id. Nothing else travels.
 */

export interface PresenceMember {
    id: number;
    name: string;
}

interface PresenceStore {
    members: PresenceMember[];
    setMembers: (members: PresenceMember[]) => void;
    add: (member: PresenceMember) => void;
    remove: (id: number) => void;
    clear: () => void;
}

export const usePresenceStore = create<PresenceStore>()((set) => ({
    members: [],

    setMembers: (members) => set({ members: dedupe(members) }),
    add: (member) => set((state) => ({ members: dedupe([...state.members, member]) })),
    remove: (id) => set((state) => ({ members: state.members.filter((one) => one.id !== id) })),
    clear: () => set({ members: [] }),
}));

/**
 * One row per person, whatever they have open. Somebody with the drawing in two tabs is one
 * person twice on the channel, and a strip that named them twice would be reporting the number
 * of browsers rather than the number of people.
 */
function dedupe(members: PresenceMember[]): PresenceMember[] {
    const byId = new Map(members.map((member) => [member.id, member]));

    return [...byId.values()];
}
