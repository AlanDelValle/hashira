import type { Point } from '@/editor/geometry/vec';
import { usePresenceStore, type PresenceMember } from '@/editor/store/presenceStore';

import { echo } from './echo';

/**
 * Who else is looking at this drawing, and where their pointer is.
 *
 * Two kinds of thing travel, and they travel differently on purpose.
 *
 * **Who is here** comes from the channel itself. Reverb tells every subscriber who joined and
 * who left, and the payload is whatever `routes/channels.php` returned when it authorized
 * them — a name and an id. It changes rarely, so it lives in a store and React reads it.
 *
 * **Where their pointer is** is a client event, whispered between the browsers already on the
 * channel without touching PHP. A pointer moves tens of times a second; putting that through a
 * request would be a queue of work for something stale before it is read. The server's part in
 * a cursor was deciding, once, who is allowed on the channel.
 *
 * And a remote cursor is **not** React state. It arrives at pointer rate, and rule 5 says
 * interaction state lives in a plain object the render loop reads — the same bargain a drag
 * makes. A cursor moving must cost zero renders.
 */

/** Whispers, at most this often. Twenty a second reads as live and is not a flood. */
const WHISPER_INTERVAL_MS = 50;

/** Below this, a move is not worth a message: it is the same place, in world millimetres. */
const WHISPER_EPSILON_MM = 0.5;

export interface RemoteCursor {
    userId: number;
    name: string;
    at: Point;
}

/**
 * Where everybody else's pointer is, by account id. Mutated in place and read by the next
 * frame — never put in a store, for the reason in the docblock above.
 */
export const remoteCursors = new Map<number, RemoteCursor>();

/*
 * Both surfaces paint cursors and neither shares a render loop with the other, so they say so
 * here rather than this module knowing which one is on screen. The editor's renderer marks
 * itself dirty; the review surface marks itself dirty; a build with no socket never notifies
 * anybody at all.
 */
const listeners = new Set<() => void>();

export function subscribeToCursors(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

function changed(): void {
    for (const listener of listeners) {
        listener();
    }
}

interface Channel {
    here: (handler: (members: PresenceMember[]) => void) => Channel;
    joining: (handler: (member: PresenceMember) => void) => Channel;
    leaving: (handler: (member: PresenceMember) => void) => Channel;
    listenForWhisper: (event: string, handler: (payload: unknown) => void) => Channel;
    whisper: (event: string, payload: unknown) => Channel;
}

let channel: Channel | null = null;
let joinedProjectId: string | null = null;
let self: PresenceMember | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** The last place our own pointer was, and whether it has moved since the last whisper. */
let pointer: Point | null = null;
let whispered: Point | null = null;

/**
 * Join a project's presence channel. Safe to call when there is no socket: it does nothing,
 * and nothing that reads presence has to know the difference.
 */
export function joinProject(projectId: string, me: PresenceMember): void {
    if (joinedProjectId === projectId) {
        return;
    }

    leaveProject();

    const client = echo();

    if (client === null) {
        return;
    }

    joinedProjectId = projectId;
    self = me;

    const joined = client.join(`project.${projectId}`) as unknown as Channel;

    channel = joined;

    joined
        .here((members) => usePresenceStore.getState().setMembers(members))
        .joining((member) => usePresenceStore.getState().add(member))
        .leaving((member) => {
            usePresenceStore.getState().remove(member.id);

            // Their pointer goes with them; a cursor left behind is a person who is not there.
            remoteCursors.delete(member.id);
            changed();
        })
        .listenForWhisper('cursor', (payload) => receive(payload));

    timer = setInterval(whisperPointer, WHISPER_INTERVAL_MS);
}

export function leaveProject(): void {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }

    const client = echo();

    if (client !== null && joinedProjectId !== null) {
        client.leave(`project.${joinedProjectId}`);
    }

    channel = null;
    joinedProjectId = null;
    self = null;
    pointer = null;
    whispered = null;

    remoteCursors.clear();
    usePresenceStore.getState().clear();
    changed();
}

/**
 * Where our own pointer is, in world millimetres, or null when it has left the drawing. Each
 * surface calls this from its own pointer handling; the throttling is here so neither has to
 * think about it.
 */
export function reportPointer(at: Point | null): void {
    pointer = at;
}

function whisperPointer(): void {
    if (channel === null || self === null || pointer === null) {
        return;
    }

    if (
        whispered !== null &&
        Math.abs(whispered.x - pointer.x) < WHISPER_EPSILON_MM &&
        Math.abs(whispered.y - pointer.y) < WHISPER_EPSILON_MM
    ) {
        return;
    }

    whispered = pointer;
    channel.whisper('cursor', { userId: self.id, x: pointer.x, y: pointer.y });
}

/**
 * A cursor from somebody else.
 *
 * It arrives from another browser, so it is read rather than trusted. A payload that is not
 * two finite numbers is dropped, and the **name** is looked up in the channel's own member
 * list rather than taken from the message — so nobody can whisper themselves a name that is
 * not theirs, and a cursor claiming somebody who is not on the channel is ignored entirely.
 *
 * The id itself is the sender's word. The Pusher protocol does not stamp a client event with
 * who sent it, so the honest limit is this: somebody already on the channel could move another
 * member's cursor. Closing that would mean routing every pointer move through PHP, which is
 * exactly what a cursor must not cost — and the people who could do it are already people the
 * owner let into the drawing.
 */
export function readCursor(
    payload: unknown,
    members: readonly PresenceMember[],
): RemoteCursor | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const { x, y, userId } = payload as { x?: unknown; y?: unknown; userId?: unknown };

    if (typeof x !== 'number' || !Number.isFinite(x)) {
        return null;
    }

    if (typeof y !== 'number' || !Number.isFinite(y)) {
        return null;
    }

    const member = members.find((one) => one.id === userId);

    if (member === undefined) {
        return null;
    }

    return { userId: member.id, name: member.name, at: { x, y } };
}

function receive(payload: unknown): void {
    const cursor = readCursor(payload, usePresenceStore.getState().members);

    if (cursor === null) {
        return;
    }

    remoteCursors.set(cursor.userId, cursor);
    changed();
}
