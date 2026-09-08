/** Response shapes returned by the API resources in app/Http/Resources. */

export interface AuthenticatedUser {
    id: number;
    name: string;
    email: string;
}

/**
 * What a share link offers. `viewer` is the only one an anonymous visitor can take up;
 * the other two mean signing in, which is what keeps every write authorized against an
 * account rather than against a URL.
 */
export type ShareRole = 'viewer' | 'commenter' | 'editor';

/** What somebody holds in a project. Viewing is never a standing — it is what a link does. */
export type ProjectRole = 'owner' | 'commenter' | 'editor';

export interface ProjectSummary {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    documentId?: string | null;
    isShared?: boolean;
    /** What the person reading this holds here. */
    role: ProjectRole | null;
    /** Only present on somebody else's project — a person's name, or a firm's. */
    ownerName?: string;
    /** Which firm's it is, or null for somebody's own drawing. */
    organisationId?: string | null;
    /** Their own membership row — what they delete in order to leave. */
    membershipId?: string;
    /** Whether being in the owning firm is enough to open it. */
    restricted?: boolean;
}

/** A firm, and what the person reading holds in it. */
export interface Organisation {
    id: string;
    name: string;
    createdAt: string;
    role: 'admin' | 'member' | null;
    memberCount?: number;
}

export type OrganisationRole = 'admin' | 'member';

/** One person in a firm, as an admin deciding about them sees it. */
export interface OrganisationMember {
    id: string;
    userId: number;
    name: string;
    email: string;
    role: OrganisationRole;
    joinedAt: string;
}

/** An offer to join a firm that has not been taken up. Never carries the token. */
export interface OrganisationInvitation {
    id: string;
    email: string;
    role: OrganisationRole;
    invitedAt: string;
    expiresAt: string | null;
    /** Present when the person being told is the one who was invited. */
    organisationName?: string;
    invitedByName?: string | null;
    /** Also only for the addressee, who already has it in their inbox. */
    token?: string;
}

/** Somebody who was let into a project, as their owner sees them. */
export interface ProjectMember {
    id: string;
    name: string;
    email: string;
    role: Exclude<ProjectRole, 'owner'>;
    joinedAt: string;
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
    /**
     * How far the edit log had got when this snapshot was written. A client asks for
     * everything after it, so somebody opening the drawing mid-session is not quietly behind.
     */
    sequence: number;
    drawing: unknown;
    /** The blocks this drawing refers to; it stores their ids, never their geometry. */
    blocks: BlockPayload[];
    /** What the reader may do with it. The editor asks before it opens. */
    role: ProjectRole | null;
    updatedAt: string;
}

export interface SharedDocumentPayload {
    name: string;
    schemaVersion: number;
    drawing: unknown;
    blocks: BlockPayload[];
    /** What this link offers, which is not the same as what the visitor currently has. */
    role: ShareRole;
    updatedAt: string;
}

export interface ShareLink {
    id: string;
    url: string;
    role: ShareRole;
    expiresAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
    createdAt: string;
}

/**
 * One thing said in a thread. Named `DrawingComment` rather than `Comment` because the DOM
 * already has a `Comment` and a file importing both would be reading a coin toss.
 *
 * `authorName` is null when the account that wrote it has been deleted: the words stay, and
 * what that reads as is the interface's sentence to write. `authorId` is what decides whether
 * a delete control is offered, without a second request.
 */
export interface DrawingComment {
    id: string;
    body: string;
    authorId: number | null;
    authorName: string | null;
    /**
     * Who this was aimed at, with the text exactly as it was typed. The server resolves them;
     * the client highlights those strings and parses nothing, so there is one matching rule
     * rather than two that can disagree.
     */
    mentions: CommentMention[];
    createdAt: string;
}

export interface CommentMention {
    userId: number | null;
    /** Their name today, which is not necessarily the text that was typed. */
    name: string | null;
    text: string;
}

/** Somebody who can be mentioned on a project: a name and an id, and nothing else. */
export interface ProjectPerson {
    id: number;
    name: string;
}

/** A conversation, and the place on the drawing it points at. `x` and `y` are millimetres. */
export interface CommentThread {
    id: string;
    x: number;
    y: number;
    elementId: string | null;
    resolved: boolean;
    resolvedAt: string | null;
    authorId: number | null;
    authorName: string | null;
    createdAt: string;
    comments: DrawingComment[];
}

/**
 * A remark you were named in, as it looks before you have opened it. The body arrives whole:
 * where a line ends is a question about the width of a menu, and the server does not know that.
 */
export interface Mention {
    id: string;
    body: string;
    authorName: string | null;
    createdAt: string;
    read: boolean;
    projectId: string;
    projectName: string;
    threadId: string;
}
