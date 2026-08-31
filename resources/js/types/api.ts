/** Response shapes returned by the API resources in app/Http/Resources. */

export interface AuthenticatedUser {
    id: number;
    name: string;
    email: string;
}

export interface ProjectSummary {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    documentId?: string | null;
    isShared?: boolean;
}

/**
 * A block somebody made. Shaped like a built-in block's definition, because that is what it
 * is — the library is where a block comes from, not what it is.
 */
export interface BlockPayload {
    id: string;
    name: string;
    category: string;
    width: number;
    height: number;
    draw: unknown[];
    createdAt: string;
}

/**
 * `drawing` is the document itself. It is deliberately untyped at this boundary: the schema
 * is validated on the way in by the editor's own parser rather than trusted because a
 * TypeScript interface says so. See docs/document-format.md.
 */
export interface DocumentPayload {
    id: string;
    projectId: string;
    name: string;
    schemaVersion: number;
    revision: number;
    drawing: unknown;
    /** The blocks this drawing refers to; it stores their ids, never their geometry. */
    blocks: BlockPayload[];
    updatedAt: string;
}

export interface SharedDocumentPayload {
    name: string;
    schemaVersion: number;
    drawing: unknown;
    blocks: BlockPayload[];
    updatedAt: string;
}

export interface ShareLink {
    id: string;
    url: string;
    role: 'viewer';
    expiresAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
    createdAt: string;
}
