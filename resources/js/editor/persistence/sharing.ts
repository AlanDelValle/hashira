import { api, type Envelope } from '@/lib/api';
import type {
    OrganisationMember,
    ProjectMember,
    ProjectSummary,
    ShareLink,
    ShareRole,
} from '@/types/api';

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

/**
 * Who in the firm may open this one.
 *
 * Restriction is its own endpoint rather than a field on the project, because deciding who may
 * open a drawing and renaming it are different acts asked of different people.
 */
export function setRestriction(projectId: string, restricted: boolean): Promise<ProjectSummary> {
    return api
        .put<Envelope<ProjectSummary>>(`/api/projects/${projectId}/restriction`, { restricted })
        .then((response) => response.data);
}

/** Naming a colleague on a drawing. Only somebody already in the owning firm can be named. */
export function admitMember(
    projectId: string,
    userId: number,
    role: Exclude<ShareRole, 'viewer'>,
): Promise<ProjectMember> {
    return api
        .post<Envelope<ProjectMember>>(`/api/projects/${projectId}/members`, { userId, role })
        .then((response) => response.data);
}

/** The project itself, for the two things the share dialog cannot learn from a link. */
export function fetchProject(projectId: string): Promise<ProjectSummary> {
    return api
        .get<Envelope<ProjectSummary>>(`/api/projects/${projectId}`)
        .then((response) => response.data);
}

/** Everybody in a firm, so an admin can pick one to name. */
export function fetchFirmMembers(organisationId: string): Promise<OrganisationMember[]> {
    return api
        .get<Envelope<OrganisationMember[]>>(`/api/organisations/${organisationId}/members`)
        .then((response) => response.data);
}
