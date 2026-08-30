import { api, type Envelope } from '@/lib/api';
import type { ShareLink } from '@/types/api';

/**
 * A project has at most one live link at a time. Issuing a new one revokes whatever came
 * before, so "share" has one meaning in the interface and revoking is unambiguous — there is
 * never a second live URL someone has forgotten about.
 */
export function fetchShareLink(projectId: string): Promise<ShareLink | null> {
    return api
        .get<Envelope<ShareLink | null>>(`/api/projects/${projectId}/share`)
        .then((response) => response.data);
}

export function issueShareLink(projectId: string): Promise<ShareLink> {
    return api
        .post<Envelope<ShareLink>>(`/api/projects/${projectId}/share`)
        .then((response) => response.data);
}

export function revokeShareLink(projectId: string): Promise<void> {
    return api.delete(`/api/projects/${projectId}/share`);
}
