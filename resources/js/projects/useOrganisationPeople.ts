import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type Envelope } from '@/lib/api';
import type { OrganisationInvitation, OrganisationMember, OrganisationRole } from '@/types/api';

interface PeopleState {
    members: OrganisationMember[];
    invitations: OrganisationInvitation[];
    loading: boolean;
    error: string | null;
    /** Whatever the server refused, in its own words. */
    refusal: string | null;
    /*
     * Each of these answers whether the server accepted it. A caller that only wants the list
     * to catch up can ignore the answer — the refusal is already on screen — but one that does
     * something further, like leaving the page it is written on, has to know.
     */
    invite: (email: string, role: OrganisationRole) => Promise<boolean>;
    revoke: (invitationId: string) => Promise<boolean>;
    setRole: (memberId: string, role: OrganisationRole) => Promise<boolean>;
    remove: (memberId: string) => Promise<boolean>;
}

/**
 * What the server said no to, in its own words.
 *
 * Validation carries the sentence — "You are the only admin. Make somebody else an admin
 * before you leave." — and the generic message is the fallback for everything else.
 */
function refusalFrom(caught: unknown): string {
    if (!(caught instanceof ApiError)) {
        return 'That did not work. Try again.';
    }

    return Object.values(caught.errors)[0]?.[0] ?? caught.message;
}

/**
 * Who is in a firm, and the acts an admin performs on that list.
 *
 * Refusals are kept rather than thrown at the console. Everything here has a rule behind it —
 * the last admin cannot be demoted, removed or allowed to leave; somebody already in the firm
 * cannot be invited again — and each one is refused with a sentence saying why. Swallowing
 * those would leave a button that does nothing, which is the worst way to enforce a rule.
 */
export function useOrganisationPeople(organisationId: string, canManage: boolean): PeopleState {
    const [members, setMembers] = useState<OrganisationMember[]>([]);
    const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refusal, setRefusal] = useState<string | null>(null);

    const [reloads, setReloads] = useState(0);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<OrganisationMember[]>>(`/api/organisations/${organisationId}/members`)
            .then(async (people) => {
                if (cancelled) return;

                setMembers(people.data);

                // Only an admin may see what is outstanding, so only an admin asks. Asking
                // anyway would put a 403 in everybody else's console on every visit.
                if (!canManage) return;

                const open = await api.get<Envelope<OrganisationInvitation[]>>(
                    `/api/organisations/${organisationId}/invitations`,
                );

                if (!cancelled) setInvitations(open.data);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load who is here.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [organisationId, canManage, reloads]);

    /**
     * Run something the server may refuse, keep the refusal to show, and say which happened.
     *
     * The answer exists because swallowing the rejection here is only half of not throwing it
     * at the console: a caller that carries on regardless — navigating away, say — leaves the
     * sentence written on a page nobody is looking at any more, which is the button that does
     * nothing this was written to prevent.
     */
    const attempt = useCallback(async (act: () => Promise<unknown>) => {
        setRefusal(null);

        try {
            await act();
            setReloads((current) => current + 1);

            return true;
        } catch (caught) {
            setRefusal(refusalFrom(caught));

            return false;
        }
    }, []);

    return {
        members,
        invitations,
        loading,
        error,
        refusal,
        invite: (email, role) =>
            attempt(() =>
                api.post(`/api/organisations/${organisationId}/invitations`, { email, role }),
            ),
        revoke: (invitationId) =>
            attempt(() =>
                api.delete(`/api/organisations/${organisationId}/invitations/${invitationId}`),
            ),
        setRole: (memberId, role) =>
            attempt(() =>
                api.patch(`/api/organisations/${organisationId}/members/${memberId}`, { role }),
            ),
        remove: (memberId) =>
            attempt(() => api.delete(`/api/organisations/${organisationId}/members/${memberId}`)),
    };
}
