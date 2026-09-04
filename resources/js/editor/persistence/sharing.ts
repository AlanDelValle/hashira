import { api, type Envelope } from '@/lib/api';
import type { ProjectMember, ProjectSummary, ShareLink, ShareRole } from '@/types/api';

/**
 * A project has at most one live link at a time. Issuing a new one revokes whatever came
 * before, so "share" has one meaning in the interface and revoking is unambiguous — there is
 * never a second live URL someone has forgotten about.
 *
 * Revoking closes the door; it does not empty the room. Somebody who took the link up while
 * it was live holds a membership of the project, and that is a separate thing to withdraw —
 * otherwise an owner could not re-issue a link without evicting their own collaborators.
 */
export function fetchShareLink(projectId: string): Promise<ShareLink | null> {
    return api
        .get<Envelope<ShareLink | null>>(`/api/projects/${projectId}/share`)
        .then((response) => response.data);
}

export function issueShareLink(projectId: string, role: ShareRole): Promise<ShareLink> {
    return api
        .post<Envelope<ShareLink>>(`/api/projects/${projectId}/share`, { role })
        .then((response) => response.data);
}

export function revokeShareLink(projectId: string): Promise<void> {
    return api.delete(`/api/projects/${projectId}/share`);
}

/**
 * Taking up a link that offers commenting or editing, which is the one moment a token decides
 * anything: it writes a membership, and everything afterwards is authorized against that.
 * Answers with the project, so the caller can go straight to it.
 */
export function acceptShareLink(token: string): Promise<ProjectSummary> {
    return api
        .post<Envelope<ProjectSummary>>(`/api/share/${token}/accept`)
        .then((response) => response.data);
}

export function fetchMembers(projectId: string): Promise<ProjectMember[]> {
    return api
        .get<Envelope<ProjectMember[]>>(`/api/projects/${projectId}/members`)
        .then((response) => response.data);
}

export function removeMember(projectId: string, memberId: string): Promise<void> {
    return api.delete(`/api/projects/${projectId}/members/${memberId}`);
}
