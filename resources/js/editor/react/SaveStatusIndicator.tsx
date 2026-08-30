import { useSyncExternalStore } from 'react';

import { autosave, type SaveStatus } from '@/editor/persistence/autosave';
import { formatRelativeTime } from '@/lib/time';
import { cn } from '@/lib/cn';

export function useSaveStatus(): SaveStatus {
    return useSyncExternalStore(
        (listener) => autosave.subscribe(listener),
        () => autosave.getStatus(),
        () => autosave.getStatus(),
    );
}

/**
 * Whether the drawing is safe.
 *
 * Deliberately quiet for the states that are fine and loud only for the one that is not:
 * a conflict means the server holds work this session has never seen, and the only honest
 * thing to do is stop saving and say so, with the way out next to the message.
 */
export function SaveStatusIndicator() {
    const status = useSaveStatus();

    if (status.kind === 'conflict') {
        return (
            <div className="flex items-center gap-2" role="alert">
                <span className="text-danger text-[13px]">Saved elsewhere</span>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="border-line-strong text-ink hover:bg-sunken rounded-sm border px-1.5 py-0.5 text-[12px]"
                >
                    Reload
                </button>
            </div>
        );
    }

    if (status.kind === 'error') {
        return (
            <div className="flex items-center gap-2" role="status">
                <span className="text-danger text-[13px]" title={status.message}>
                    Could not save
                </span>
                <button
                    type="button"
                    onClick={() => autosave.flush()}
                    className="border-line-strong text-ink hover:bg-sunken rounded-sm border px-1.5 py-0.5 text-[12px]"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <span
            role="status"
            aria-live="polite"
            className={cn(
                'text-[13px] transition-colors',
                status.kind === 'saving' ? 'text-ink-muted' : 'text-ink-subtle',
            )}
        >
            {label(status)}
        </span>
    );
}

function label(status: SaveStatus): string {
    switch (status.kind) {
        case 'editing':
            return 'Editing…';
        case 'saving':
            return 'Saving…';
        case 'saved':
            return `Saved ${formatRelativeTime(new Date(status.at).toISOString())}`;
        case 'idle':
        case 'error':
        case 'conflict':
            return '';
    }
}
