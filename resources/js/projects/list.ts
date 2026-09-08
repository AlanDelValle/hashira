import type { ProjectSummary } from '@/types/api';

/**
 * Turning the projects the server sent into the list a person reads.
 *
 * All of it happens here rather than in a query, because the dashboard already holds the whole
 * list in memory — `useProjects` says so and depends on it — and re-sorting an array somebody
 * is looking at should not cost a round trip. When this list is long enough to page, that is
 * the change that moves this to the server, and none of it before then.
 */

export type ProjectOrder = 'updated' | 'name' | 'created';

export const ORDER_LABEL: Record<ProjectOrder, string> = {
    updated: 'Recently updated',
    name: 'Name',
    created: 'Recently created',
};

/**
 * How many projects there have to be before the list offers to filter and sort itself.
 *
 * A control that cannot help is clutter, and a search field over three rows is a search field
 * that has never once been faster than reading. The same rule decides the group headings below:
 * somebody working alone, on their own drawings, meets neither.
 */
export const CONTROLS_FROM = 8;

export interface ProjectGroup {
    /** Stable across renders and unique within the list, for the key and the heading's id. */
    id: string;
    name: string;
    /**
     * Whether the heading is the name of whoever owns everything under it.
     *
     * True of a firm's section and of nothing else. A row does not repeat what the heading
     * above it already said — but "Yours" and "Shared with you" are not owners' names, and the
     * second holds drawings belonging to several different people, so those rows still say.
     */
    namesOwner: boolean;
    /** The firm this section is, when it is one — so its heading can lead to it. */
    organisationId: string | null;
    projects: ProjectSummary[];
}

/** Whether it has been put away. An archived drawing still opens; it is just not in the way. */
export function isArchived(project: ProjectSummary): boolean {
    return (project.archivedAt ?? null) !== null;
}

/** The live ones and the put-away ones, in one pass, each keeping the order they arrived in. */
export function partitionArchived(projects: ProjectSummary[]): {
    live: ProjectSummary[];
    archived: ProjectSummary[];
} {
    const live: ProjectSummary[] = [];
    const archived: ProjectSummary[] = [];

    for (const project of projects) {
        (isArchived(project) ? archived : live).push(project);
    }

    return { live, archived };
}

export interface ArrangeOptions {
    query?: string;
    order?: ProjectOrder;
}

/** Filtered and sorted, without the grouping — what the archived shelf shows. */
export function orderProjects(
    projects: ProjectSummary[],
    { query = '', order = 'updated' }: ArrangeOptions = {},
): ProjectSummary[] {
    const needle = fold(query);
    const kept = needle === '' ? projects : projects.filter((each) => matches(each, needle));

    return [...kept].sort(comparing(order));
}

/**
 * The same, in the sections a person thinks in: your own drawings, then each firm's, then what
 * somebody handed you.
 *
 * Whose a drawing is has been a fact in the database since 10.2 and a grey suffix on the end of
 * a sentence ever since. A section is what that fact actually looks like — and the sections are
 * built out of the projects rather than out of the list of firms, so a drawing belonging to a
 * firm you are not in still lands somewhere true: under "Shared with you", because a role you
 * were granted is what you hold in it.
 *
 * Empty sections are dropped, and one section is not a section — the page draws no heading at
 * all when everything falls under the same one.
 */
export function arrangeProjects(
    projects: ProjectSummary[],
    options: ArrangeOptions = {},
): ProjectGroup[] {
    const yours: ProjectSummary[] = [];
    const shared: ProjectSummary[] = [];
    const firms = new Map<string, ProjectGroup>();

    for (const project of orderProjects(projects, options)) {
        // Not yours to begin with: what you hold here was granted, whoever owns it.
        if (project.role !== 'owner') {
            shared.push(project);
            continue;
        }

        const firm = project.organisationId ?? null;

        if (firm === null) {
            yours.push(project);
            continue;
        }

        const group = firms.get(firm) ?? {
            id: `firm:${firm}`,
            namesOwner: true,
            organisationId: firm,
            // Sent for every firm's project, including to the admins who hold `owner` in it —
            // which is the one case where "only worth saying about somebody else's" was wrong.
            name: project.ownerName ?? 'A firm',
            projects: [],
        };

        group.projects.push(project);
        firms.set(firm, group);
    }

    return [
        { id: 'yours', name: 'Yours', namesOwner: false, organisationId: null, projects: yours },
        ...[...firms.values()].sort((a, b) => a.name.localeCompare(b.name)),
        {
            id: 'shared',
            name: 'Shared with you',
            namesOwner: false,
            organisationId: null,
            projects: shared,
        },
    ].filter((group) => group.projects.length > 0);
}

/** Matched on the name and on whose it is, since both are things somebody types looking for it. */
function matches(project: ProjectSummary, needle: string): boolean {
    return fold(`${project.name} ${project.ownerName ?? ''}`).includes(needle);
}

/**
 * Lowercased and stripped of its accents, so that "patio" finds "Casa Pátio".
 *
 * Typing the accent is the slow way to reach a drawing and the keyboard is not always the one
 * the name was written on. Nothing is displayed from this — it decides matching only.
 */
function fold(value: string): string {
    return value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

function comparing(order: ProjectOrder): (a: ProjectSummary, b: ProjectSummary) => number {
    if (order === 'name') {
        return (a, b) => a.name.localeCompare(b.name);
    }

    const field = order === 'created' ? 'createdAt' : 'updatedAt';

    // Parsed rather than compared as strings: these are ISO 8601 with an offset, and two of
    // them written in different offsets sort by their text in the wrong order.
    return (a, b) => Date.parse(b[field]) - Date.parse(a[field]);
}
