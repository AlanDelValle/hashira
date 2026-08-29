import type { HashiraDocument } from '@/editor/model/types';

import { coalesce, type Command } from './command';

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
