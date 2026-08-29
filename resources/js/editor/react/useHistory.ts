import { useSyncExternalStore } from 'react';

import { history } from '@/editor/store/documentStore';
import type { HistoryState } from '@/editor/commands/history';

/** Subscribes the chrome to the undo stack without giving React any say over it. */
export function useHistory(): HistoryState {
    return useSyncExternalStore(
        (listener) => history.subscribe(listener),
        () => history.getState(),
        () => history.getState(),
    );
}
