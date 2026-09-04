import { api, type Envelope } from '@/lib/api';
import type { CommentThread, DrawingComment, ProjectPerson } from '@/types/api';

/**
 * The conversations on a drawing.
 *
 * Comments are not part of the document and never travel through a command: they are not
 * something anybody drew, so they are not in `documents.data`, not in undo, not in an export
 * and not in the version comparison. That decision is in roadmap.md, Phase 9.
 *
 * Which also means none of this is autosaved. A remark is posted when it is written, once,
 * and it is on the server before the person who wrote it has looked away.
 */
export function fetchThreads(projectId: string): Promise<CommentThread[]> {
    return api
        .get<Envelope<CommentThread[]>>(`/api/projects/${projectId}/comments`)
        .then((response) => response.data);
}

export function startThread(
    projectId: string,
    body: { x: number; y: number; elementId: string | null; body: string },
): Promise<CommentThread> {
    return api
        .post<Envelope<CommentThread>>(`/api/projects/${projectId}/comments`, body)
        .then((response) => response.data);
}

export function replyToThread(
    projectId: string,
    threadId: string,
    body: string,
): Promise<DrawingComment> {
    return api
        .post<Envelope<DrawingComment>>(`/api/projects/${projectId}/comments/${threadId}/replies`, {
            body,
        })
        .then((response) => response.data);
}

export function setThreadResolved(
    projectId: string,
    threadId: string,
    resolved: boolean,
): Promise<CommentThread> {
    return api
        .patch<Envelope<CommentThread>>(`/api/projects/${projectId}/comments/${threadId}`, {
            resolved,
        })
        .then((response) => response.data);
}

export function deleteThread(projectId: string, threadId: string): Promise<void> {
    return api.delete(`/api/projects/${projectId}/comments/${threadId}`);
}

export function deleteReply(projectId: string, threadId: string, commentId: string): Promise<void> {
    return api.delete(`/api/projects/${projectId}/comments/${threadId}/replies/${commentId}`);
}

/**
 * Who can be mentioned here: names and ids, for anybody who can open the project. Not the
 * member list — that one names accounts and belongs to the owner.
 */
export function fetchPeople(projectId: string): Promise<ProjectPerson[]> {
    return api
        .get<Envelope<ProjectPerson[]>>(`/api/projects/${projectId}/people`)
        .then((response) => response.data);
}
