import { useCallback, useEffect, useState } from 'react';

import { api, type Envelope } from '@/lib/api';
import type { Organisation } from '@/types/api';

interface OrganisationsState {
    organisations: Organisation[];
    loading: boolean;
    create: (name: string) => Promise<Organisation>;
}

/**
 * The firms this person is in.
 *
 * Deliberately thinner than `useProjects`: nothing here is renamed, deleted or left from the
 * dashboard yet — that surface arrives with 10.2b, along with the people to put in it. What it
 * exists for now is the two questions the dashboard has to answer: is this person in a firm at
 * all, and if so, which ones can a new project go into.
 *
 * A failure is silence rather than an error. Somebody who works alone is in no organisations
 * and sees no organisations, and a person whose list failed to load sees exactly what they see
 * every other day; making the dashboard shout about a list it did not need would be worse than
 * the missing choice.
 */
export function useOrganisations(): OrganisationsState {
    const [organisations, setOrganisations] = useState<Organisation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<Organisation[]>>('/api/organisations')
            .then((response) => {
                if (!cancelled) setOrganisations(response.data);
            })
            .catch(() => {
                /* No firms to show is the same shape as failing to ask. */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const create = useCallback(async (name: string) => {
        const response = await api.post<Envelope<Organisation>>('/api/organisations', { name });

        setOrganisations((current) =>
            [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)),
        );

        return response.data;
    }, []);

    return { organisations, loading, create };
}
