import type { HashiraDocument } from '@/editor/model/types';
import { useDocumentStore } from '@/editor/store/documentStore';
import { ApiError, api, type Envelope } from '@/lib/api';
import type { DocumentPayload } from '@/types/api';

/**
 * Keeping the drawing saved without ever getting in the way of drawing it.
 *
 * The rules that shape this:
 *
 * - A save must never block input. Everything here is fire-and-forget; the editor does not
 *   wait on a response and does not freeze while one is outstanding.
 * - Edits arrive in bursts. A debounce absorbs a burst, and a ceiling makes sure that someone
 *   drawing continuously still gets saved rather than only when they pause.
 * - Only one request is ever in flight. Edits made during a save are saved after it, in one
 *   further request, rather than queueing a request per keystroke.
 * - A conflict is not an error to retry. If the drawing was saved somewhere else, retrying
 *   would overwrite that work; the only correct move is to stop and say so.
 */

/** How long a burst of edits is allowed to settle before a save goes out. */
const DEBOUNCE_MS = 1_200;

/** Continuous drawing still saves this often, even with no pause to debounce against. */
const CEILING_MS = 10_000;

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

export type SaveStatus =
    | { kind: 'idle' }
    | { kind: 'editing' }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number }
    | { kind: 'error'; message: string }
    | { kind: 'conflict'; message: string };

/** The one call this needs from the outside world, so tests can supply their own. */
export interface DocumentGateway {
    save(projectId: string, revision: number, data: HashiraDocument): Promise<number>;
}

export const httpGateway: DocumentGateway = {
    async save(projectId, revision, data) {
        const response = await api.put<Envelope<DocumentPayload>>(
            `/api/projects/${projectId}/document`,
            { revision, data },
        );

        return response.data.revision;
    },
};

export class AutosaveController {
    private status: SaveStatus = { kind: 'idle' };
    private readonly listeners = new Set<() => void>();

    private projectId: string | null = null;
    private revision = 0;

    /** The document as the server last confirmed it. Anything else means unsaved work. */
    private synced: HashiraDocument | null = null;

    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private ceilingTimer: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;

    private inFlight = false;
    private unsubscribe: (() => void) | null = null;

    constructor(
        private readonly gateway: DocumentGateway = httpGateway,
        private readonly now: () => number = () => Date.now(),
    ) {}

    /** Begin watching a project's drawing, treating `document` as already saved. */
    start(projectId: string, revision: number, document: HashiraDocument): void {
        this.stop();

        this.projectId = projectId;
        this.revision = revision;
        this.synced = document;
        this.retryAttempt = 0;
        this.setStatus({ kind: 'idle' });

        this.unsubscribe = useDocumentStore.subscribe((state, previous) => {
            if (state.document !== previous.document) {
                this.onDocumentChanged();
            }
        });
    }

    stop(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;

        this.clearTimer('debounceTimer');
        this.clearTimer('ceilingTimer');
        this.clearTimer('retryTimer');

        this.projectId = null;
        this.synced = null;
        this.inFlight = false;
    }

    getStatus(): SaveStatus {
        return this.status;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    /** True when the drawing holds work the server has not confirmed. */
    isDirty(): boolean {
        return this.synced !== null && useDocumentStore.getState().document !== this.synced;
    }

    /** Save now — what Ctrl+S does, and what a conflict's "try again" does. */
    flush(): void {
        this.clearTimer('debounceTimer');
        this.clearTimer('retryTimer');
        this.send();
    }

    private onDocumentChanged(): void {
        if (!this.isDirty()) {
            return;
        }

        /*
         * Two states are deliberately left alone by further editing.
         *
         * A conflict is sticky: once the server holds work this session has not seen, no
         * amount of drawing may resume overwriting it.
         *
         * An outage already has a retry scheduled, and that retry sends whatever the drawing
         * looks like when it fires. Rescheduling here would reset the backoff on every stroke
         * — hammering a server that is already struggling — and would replace the message
         * saying the save failed with one saying everything is fine.
         */
        if (this.status.kind === 'conflict' || this.status.kind === 'error') {
            return;
        }

        this.setStatus({ kind: 'editing' });

        this.clearTimer('debounceTimer');
        this.debounceTimer = setTimeout(() => this.send(), DEBOUNCE_MS);

        this.ceilingTimer ??= setTimeout(() => this.send(), CEILING_MS);
    }

    private send(): void {
        this.clearTimer('debounceTimer');
        this.clearTimer('ceilingTimer');

        const projectId = this.projectId;
        const document = useDocumentStore.getState().document;

        if (projectId === null || this.inFlight || !this.isDirty()) {
            return;
        }

        if (this.status.kind === 'conflict') {
            return;
        }

        this.inFlight = true;
        this.setStatus({ kind: 'saving' });

        void this.gateway
            .save(projectId, this.revision, document)
            .then((revision) => {
                this.inFlight = false;
                this.revision = revision;
                this.synced = document;
                this.retryAttempt = 0;
                this.setStatus({ kind: 'saved', at: this.now() });

                // Work that arrived while the request was out goes in one further save,
                // not one save per edit.
                if (this.isDirty()) {
                    this.onDocumentChanged();
                }
            })
            .catch((error: unknown) => {
                this.inFlight = false;
                this.onFailed(error);
            });
    }

    private onFailed(error: unknown): void {
        if (error instanceof ApiError && error.isConflict) {
            this.setStatus({
                kind: 'conflict',
                message: 'This drawing was saved somewhere else. Reload to see that version.',
            });

            return;
        }

        const message = error instanceof ApiError ? error.message : 'Could not reach the server.';

        this.setStatus({ kind: 'error', message });

        this.retryAttempt += 1;

        const delay = Math.min(RETRY_BASE_MS * 2 ** (this.retryAttempt - 1), RETRY_MAX_MS);

        this.clearTimer('retryTimer');
        this.retryTimer = setTimeout(() => this.send(), delay);
    }

    private clearTimer(name: 'debounceTimer' | 'ceilingTimer' | 'retryTimer'): void {
        const timer = this[name];

        if (timer !== null) {
            clearTimeout(timer);
            this[name] = null;
        }
    }

    private setStatus(status: SaveStatus): void {
        this.status = status;

        for (const listener of this.listeners) {
            listener();
        }
    }
}

export const autosave = new AutosaveController();
