import { useCallback, useEffect, useState } from 'react';

import { api, type Envelope } from '@/lib/api';
import type { ProjectSummary } from '@/types/api';

interface ProjectsState {
    projects: ProjectSummary[];
    loading: boolean;
    error: string | null;
    /** Ask for the list again after a failure. */
    reload: () => void;
    create: (name: string) => Promise<ProjectSummary>;
    rename: (id: string, name: string) => Promise<void>;
    duplicate: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

/**
 * The dashboard's data. Small enough to hold the whole list in memory and re-sort locally:
 * the server orders by recent activity, and every mutation here preserves that order without
 * a round trip, so the list never jumps under the pointer.
 */
export function useProjects(): ProjectsState {
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    const reload = useCallback(() => {
        setLoading(true);
        setError(null);
        setAttempt((current) => current + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<ProjectSummary[]>>('/api/projects')
            .then((response) => {
                if (!cancelled) setProjects(response.data);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load your projects.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const create = useCallback(async (name: string) => {
        const response = await api.post<Envelope<ProjectSummary>>('/api/projects', { name });
        setProjects((current) => [response.data, ...current]);

        return response.data;
    }, []);

    const rename = useCallback(async (id: string, name: string) => {
        const response = await api.patch<Envelope<ProjectSummary>>(`/api/projects/${id}`, { name });
        setProjects((current) =>
            current.map((project) => (project.id === id ? response.data : project)),
        );
    }, []);

    const duplicate = useCallback(async (id: string) => {
        const response = await api.post<Envelope<ProjectSummary>>(`/api/projects/${id}/duplicate`);
        setProjects((current) => [response.data, ...current]);
    }, []);

    const remove = useCallback(async (id: string) => {
        await api.delete(`/api/projects/${id}`);
        setProjects((current) => current.filter((project) => project.id !== id));
    }, []);

    return { projects, loading, error, reload, create, rename, duplicate, remove };
}
