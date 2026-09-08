import { useCallback, useEffect, useState } from 'react';

import { api, type Envelope } from '@/lib/api';
import type { OrganisationInvitation } from '@/types/api';

interface InvitationsState {
    invitations: OrganisationInvitation[];
    answer: (invitation: OrganisationInvitation, answer: 'accept' | 'decline') => Promise<void>;
}

/**
 * What has been offered to this person.
 *
 * The dashboard shows these because an invitation that only exists in an inbox is an invitation
 * somebody finds a fortnight later. The token comes back on their own invitations — they have
 * it in the email already — so accepting from here is the same act as clicking the link.
 *
 * A failure is silence: somebody with no invitations and somebody whose list failed to load see
 * the same dashboard, and it is the one they were expecting.
 */
export function useInvitations(): InvitationsState {
    const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);

    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<OrganisationInvitation[]>>('/api/invitations')
            .then((response) => {
                if (!cancelled) setInvitations(response.data);
            })
            .catch(() => {
                /* Nothing offered and nothing asked look the same, and should. */
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const answer = useCallback(
        async (invitation: OrganisationInvitation, answer: 'accept' | 'decline') => {
            if (invitation.token === undefined) return;

            await api.post(`/api/invitations/${invitation.token}/${answer}`);
            setAttempt((current) => current + 1);
        },
        [],
    );

    return { invitations, answer };
}
