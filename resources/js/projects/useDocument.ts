import { useEffect, useState } from 'react';

import { api, ApiError, type Envelope } from '@/lib/api';
import type { DocumentPayload } from '@/types/api';

interface Settled {
    projectId: string;
    document: DocumentPayload | null;
    error: string | null;
}

interface DocumentState {
    document: DocumentPayload | null;
    loading: boolean;
    error: string | null;
}

export function useDocument(projectId: string | undefined): DocumentState {
    const [settled, setSettled] = useState<Settled | null>(null);

    useEffect(() => {
        if (projectId === undefined) return;

        let cancelled = false;

        void api
            .get<Envelope<DocumentPayload>>(`/api/projects/${projectId}/document`)
            .then((response) => {
                if (!cancelled) setSettled({ projectId, document: response.data, error: null });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;

                setSettled({
                    projectId,
                    document: null,
                    error:
                        caught instanceof ApiError && caught.status === 404
                            ? 'This project does not exist, or is not yours.'
                            : 'Could not open this drawing.',
                });
            });

        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // Loading is derived rather than stored, so navigating to a different project cannot
    // show the previous drawing for a frame while the new request is in flight.
    const current = settled?.projectId === projectId ? settled : null;

    return {
        document: current?.document ?? null,
        loading: current === null,
        error: current?.error ?? null,
    };
}
