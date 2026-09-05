import type { CommandEnvelope } from '@/editor/commands/envelope';
import { parseCommand } from '@/editor/commands/envelope';
import { newId } from '@/editor/model/id';
import { fetchOperationsAfter, sendOperation } from '@/editor/persistence/operations';
import { onConnectionState, presenceIsConfigured } from '@/editor/presence/echo';
import { onProjectChannel } from '@/editor/presence/presence';
import { useCollaborationStore } from '@/editor/store/collaborationStore';
import { history, observeEdits } from '@/editor/store/documentStore';

/**
 * Two people drawing on one plan.
 *
 * The shape of it, in one paragraph: every edit is posted to the log, which numbers it and
 * hands it back; the server then sends it on to everybody else on the project's channel; each
 * of them parses it and applies it without it joining their undo stack. **The post is the
 * write and the broadcast is delivery**, so a socket that is down turns co-editing into
 * ordinary editing rather than into losing things.
 *
 * **An envelope describes state, never intent.** "These elements become those", not "move this
 * by 200 mm" — which is what the commands already were, and what makes two people editing
 * different things converge without anybody negotiating. Two people editing the *same* element
 * resolve to whichever edit the log accepted last, per element, which is a rule you can
 * explain to somebody.
 *
 * It also makes an echo harmless: applying "these become those" twice is applying it once. The
 * origin check below is not what keeps this correct, it is what keeps it quiet.
 *
 * What is not here yet, and is 9.2b: undo reaching the other person, and what the interface
 * says when the connection drops and this falls behind.
 */

/**
 * Which browser this is. Not the account: two tabs of one person are two editors, and each
 * should see the other's work arrive.
 */
const origin = newId();

let projectId: string | null = null;
let sequence = 0;
let detach: (() => void) | null = null;

/**
 * Edits that could not be posted, oldest first.
 *
 * Without this a change made while the socket was down would reach the other person only when
 * they next reloaded — it is in the snapshot the autosave writes, so it is not lost, but
 * "not lost" and "arrives" are different promises. Bounded, because a browser left offline
 * for an hour should stop hoarding rather than fill its own memory.
 */
const waiting: CommandEnvelope[] = [];

const MAX_WAITING = 200;

/** Whether edits are being logged at all — the autosave asks, before deciding what a conflict means. */
export function isCoEditing(): boolean {
    return projectId !== null;
}

/**
 * Start logging this drawing's edits and applying everybody else's.
 *
 * `from` is the sequence the snapshot was written at. Anything after it happened while the
 * drawing was in flight, and is fetched rather than waited for — without that there is a
 * window where somebody who opened the plan mid-session is quietly behind, which is worse
 * than being visibly behind.
 */
export function startCoEditing(id: string, from: number): void {
    stopCoEditing();

    projectId = id;
    sequence = from;

    const leaveChannel = onProjectChannel((channel) => {
        channel.listen('.operation.applied', (payload) => receive(payload));
    });

    const stopObserving = observeEdits((envelope) => recordOperation(envelope));

    /*
     * Coming back after a drop: send what was made while away, then ask for what was missed.
     * Ours first, so the log holds them in the order they were actually made here; either
     * order converges, because an envelope is state rather than intent.
     */
    const stopWatchingConnection = onConnectionState((connected) => {
        useCollaborationStore.getState().setStatus(connected ? 'live' : 'offline');

        if (connected) {
            void flushWaiting().then(catchUp);
        }
    });

    useCollaborationStore.getState().setStatus(presenceIsConfigured() ? 'live' : 'off');

    detach = () => {
        leaveChannel();
        stopObserving();
        stopWatchingConnection();
    };

    void catchUp();
}

export function stopCoEditing(): void {
    detach?.();
    detach = null;
    projectId = null;
    sequence = 0;
    waiting.length = 0;
    useCollaborationStore.getState().reset();
}

/**
 * Record a local edit. Fire and forget, like the autosave: drawing must never wait on the
 * network, and an edit that fails to post is still in this drawing and still in the snapshot
 * the autosave writes.
 *
 * One post per command, including the ones the history merges into their predecessor — a
 * nudge held down is several. Each is still "these become those", so applying them in order
 * lands on the same drawing; it is chattier than it needs to be, and coalescing the log is
 * 9.2b's to look at.
 */
function recordOperation(envelope: CommandEnvelope): void {
    const id = projectId;

    if (id === null) {
        return;
    }

    /*
     * The answer is deliberately thrown away, number and all.
     *
     * Taking our own operation's sequence from the reply would run this counter ahead of what
     * has actually been delivered: the reply to number 5 can beat the broadcast of number 4,
     * and 4 would then arrive looking like something already seen. The counter advances only
     * as edits are received, in the order the channel delivers them, which is the order the
     * log accepted them.
     */
    void sendOperation(id, envelope, origin).catch(() => {
        /*
         * The drawing is unharmed — the change is in it, and the autosave will carry it into
         * the snapshot. What has not happened is anybody else seeing it, so it waits here and
         * the interface says so.
         */
        hold(envelope);
    });
}

function hold(envelope: CommandEnvelope): void {
    if (waiting.length >= MAX_WAITING) {
        waiting.shift();
    }

    waiting.push(envelope);

    const store = useCollaborationStore.getState();

    store.setStatus('offline');
    store.setWaiting(waiting.length);
}

/** Send what was made while the socket was down, oldest first, and stop at the first refusal. */
async function flushWaiting(): Promise<void> {
    const id = projectId;

    if (id === null) {
        return;
    }

    while (waiting.length > 0) {
        const envelope = waiting[0];

        if (envelope === undefined) {
            break;
        }

        try {
            await sendOperation(id, envelope, origin);
        } catch {
            // Still not going out. Leave the rest where they are rather than sending them
            // out of order.
            useCollaborationStore.getState().setStatus('offline');

            return;
        }

        waiting.shift();
        useCollaborationStore.getState().setWaiting(waiting.length);
    }
}

async function catchUp(): Promise<void> {
    const id = projectId;

    if (id === null) {
        return;
    }

    try {
        for (const operation of await fetchOperationsAfter(id, sequence)) {
            receive(operation);
        }
    } catch {
        /* Nothing to do but carry on with the snapshot we have. */
    }
}

/**
 * What an arriving message turns out to be worth. Separated from acting on it so the rules —
 * which are all about ordering and provenance — can be read and tested without a socket.
 */
export type OperationVerdict =
    | { kind: 'ignore' }
    | { kind: 'seen'; sequence: number }
    | { kind: 'apply'; sequence: number; envelope: unknown };

/**
 * An edit from somewhere else, read rather than trusted.
 *
 * Anything at or below what has already been seen is ignored: the channel delivers in the
 * order the log accepted, so a lower number is a repeat, and acting on it would put back a
 * state the drawing has already moved past.
 *
 * Our own edit coming back is counted and not applied. Applying it would be harmless — an
 * envelope is state, and state applied twice is state — but there is no reason to make the
 * drawing flicker.
 */
export function readOperation(payload: unknown, seen: number, self: string): OperationVerdict {
    if (typeof payload !== 'object' || payload === null) {
        return { kind: 'ignore' };
    }

    const { sequence: at, origin: from, envelope } = payload as Record<string, unknown>;

    if (typeof at !== 'number' || !Number.isFinite(at) || at <= seen) {
        return { kind: 'ignore' };
    }

    if (from === self) {
        return { kind: 'seen', sequence: at };
    }

    return { kind: 'apply', sequence: at, envelope };
}

/**
 * `parseCommand` is the only way an envelope becomes a command, and it holds every element in
 * one to exactly what an element in a drawing is held to. One that will not parse is dropped
 * and the sequence still advances: refusing to move past a bad message would stall everything
 * behind it for ever.
 */
function receive(payload: unknown): void {
    const verdict = readOperation(payload, sequence, origin);

    if (verdict.kind === 'ignore') {
        return;
    }

    sequence = verdict.sequence;

    if (verdict.kind === 'seen') {
        return;
    }

    const parsed = parseCommand(verdict.envelope);

    if (parsed.ok) {
        history.apply(parsed.command);
    }
}
