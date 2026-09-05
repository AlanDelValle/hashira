import type { HashiraDocument } from '@/editor/model/types';

import { coalesce, type Command } from './command';
import type { CommandEnvelope } from './envelope';

/** How the history reads and writes the document it is managing. */
export interface DocumentPort {
    get(): HashiraDocument;
    set(document: HashiraDocument): void;
}

export interface HistoryState {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
    /** Increments on every change, so a listener can tell "something happened" cheaply. */
    version: number;
}

/** Consecutive edits of the same kind merge while they arrive faster than this. */
const COALESCE_WINDOW_MS = 600;

/** Deep enough for a long working session, bounded so a runaway loop cannot eat memory. */
const MAX_DEPTH = 500;

export class HistoryStack {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private lastExecutedAt = 0;
    private version = 0;
    private listeners = new Set<() => void>();

    /*
     * Whoever has to be told what this stack just did to the drawing.
     *
     * It lives here rather than beside `runCommand`, because undoing is an edit too: it
     * changes the document, and everybody else has to see the change. What it is not is a
     * rewind of a shared stack — the listener is handed the *inverse* of the local command,
     * an edit like any other, which is the decision the phase parked and settled.
     *
     * `apply` deliberately never reaches it. That is somebody else's edit arriving; sending it
     * back out would be an echo with a number of its own.
     */
    private edited: ((envelope: CommandEnvelope) => void) | null = null;

    /*
     * Cached so that repeated reads return the same object. React's external-store hook
     * compares snapshots by identity, and a fresh object every call is an infinite loop.
     */
    private snapshot: HistoryState = {
        canUndo: false,
        canRedo: false,
        undoLabel: null,
        redoLabel: null,
        version: 0,
    };

    constructor(
        private readonly port: DocumentPort,
        private readonly now: () => number = () => Date.now(),
    ) {}

    /** Hear about every edit made *here*, as plain JSON, ready to be sent somewhere. */
    observe(listener: (envelope: CommandEnvelope) => void): () => void {
        this.edited = listener;

        return () => {
            if (this.edited === listener) {
                this.edited = null;
            }
        };
    }

    execute(command: Command): void {
        this.port.set(command.execute(this.port.get()));

        const previous = this.undoStack.at(-1);
        const withinWindow = this.now() - this.lastExecutedAt <= COALESCE_WINDOW_MS;
        const merged = previous !== undefined && withinWindow ? coalesce(previous, command) : null;

        if (merged !== null) {
            this.undoStack[this.undoStack.length - 1] = merged;
        } else {
            this.undoStack.push(command);

            if (this.undoStack.length > MAX_DEPTH) {
                this.undoStack.shift();
            }
        }

        // A new edit is a new branch: whatever was undone is no longer reachable.
        this.redoStack = [];
        this.lastExecutedAt = this.now();
        this.emit();

        /*
         * The incoming edit is what goes out, even when it was merged into its predecessor.
         * Its `before` is the state the merged one left, so applying them in order lands on
         * the same drawing — it is one message more than strictly needed, not a wrong one.
         */
        this.edited?.(command.describe());
    }

    /**
     * Apply an edit that is not ours.
     *
     * Somebody else's change is still a command and still goes through the one door onto the
     * document — rule 2 does not stop applying because the edit arrived over a socket. What it
     * does not do is join our undo stack: undo means "take back what I did", and taking back
     * somebody else's work because it happened to be last is the behaviour that decision was
     * made to avoid.
     *
     * The redo stack is cleared for the same reason a local edit clears it. Whatever we had
     * undone was a branch off a document that has since moved on, and redoing onto this one
     * would put back a state that never existed.
     */
    apply(command: Command): void {
        this.port.set(command.execute(this.port.get()));

        this.redoStack = [];

        // Nothing may coalesce into or across an edit that is not ours.
        this.lastExecutedAt = 0;
        this.emit();
    }

    undo(): boolean {
        const command = this.undoStack.pop();

        if (command === undefined) {
            return false;
        }

        this.port.set(command.undo(this.port.get()));
        this.redoStack.push(command);

        // Stop the next edit from merging into a command that is no longer on the stack.
        this.lastExecutedAt = 0;
        this.emit();

        this.edited?.(command.describeInverse());

        return true;
    }

    redo(): boolean {
        const command = this.redoStack.pop();

        if (command === undefined) {
            return false;
        }

        this.port.set(command.execute(this.port.get()));
        this.undoStack.push(command);
        this.lastExecutedAt = 0;
        this.emit();

        this.edited?.(command.describe());

        return true;
    }

    /** Forget everything — used when a different drawing is opened. */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.lastExecutedAt = 0;
        this.emit();
    }

    getState(): HistoryState {
        return this.snapshot;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        this.version += 1;
        this.snapshot = {
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0,
            undoLabel: this.undoStack.at(-1)?.label ?? null,
            redoLabel: this.redoStack.at(-1)?.label ?? null,
            version: this.version,
        };

        for (const listener of this.listeners) {
            listener();
        }
    }
}
