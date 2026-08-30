import { api, type Envelope } from '@/lib/api';

/**
 * Named snapshots of a drawing.
 *
 * Listings carry metadata only — the payload of a version is the whole drawing, and it is only
 * ever wanted one at a time, when someone actually restores it.
 */
export interface VersionSummary {
    id: string;
    label: string | null;
    schemaVersion: number;
    revision: number;
    createdAt: string;
    author?: string | null;
}

export interface VersionDetail extends VersionSummary {
    drawing: unknown;
}

export function listVersions(projectId: string): Promise<VersionSummary[]> {
    return api
        .get<Envelope<VersionSummary[]>>(`/api/projects/${projectId}/versions`)
        .then((response) => response.data);
}

export function createVersion(projectId: string, label: string | null): Promise<VersionSummary> {
    return api
        .post<Envelope<VersionSummary>>(`/api/projects/${projectId}/versions`, { label })
        .then((response) => response.data);
}

export function fetchVersion(projectId: string, versionId: string): Promise<VersionDetail> {
    return api
        .get<Envelope<VersionDetail>>(`/api/projects/${projectId}/versions/${versionId}`)
        .then((response) => response.data);
}
