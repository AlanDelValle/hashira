import { CloudOff } from 'lucide-react';

import { useCollaborationStore } from '@/editor/store/collaborationStore';

/**
 * Whether the people on the other end are seeing this drawing change.
 *
 * Deliberately not the same statement as the save indicator beside it. That one says the
 * drawing is safe; this one says whether anybody else is watching it happen — and the two come
 * apart, because a socket can drop while saves keep going. Somebody told "saved" would
 * otherwise carry on believing the person they are working with can see them.
 *
 * It says nothing at all when the socket is live, and nothing when there is no socket
 * configured: an editor with nobody else in it has no news, and a build without presence has
 * nobody to be disconnected from.
 *
 * The words are the message and the icon is decoration — a strikethrough cloud means nothing
 * on its own to somebody who has not met it before.
 */
export function CollaborationStatus() {
    const status = useCollaborationStore((state) => state.status);
    const waiting = useCollaborationStore((state) => state.waiting);

    if (status !== 'offline') {
        return null;
    }

    return (
        <span role="status" className="text-caution flex items-center gap-1.5 text-[13px]">
            <CloudOff className="size-3.5" aria-hidden />
            {waiting === 0
                ? 'Not connected — nobody else is seeing this'
                : `Not connected — ${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting to be shared`}
        </span>
    );
}
