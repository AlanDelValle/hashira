import { describe, expect, it } from 'vitest';

import { arrangeProjects, isArchived, orderProjects, partitionArchived } from '@/projects/list';
import type { ProjectSummary } from '@/types/api';

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
    return {
        id: overrides.name ?? 'p',
        name: 'Bedroom',
        description: null,
        createdAt: '2026-09-01T10:00:00+00:00',
        updatedAt: '2026-09-01T10:00:00+00:00',
        role: 'owner',
        organisationId: null,
        ...overrides,
    };
}

const names = (projects: ProjectSummary[]): string[] => projects.map((each) => each.name);

describe('putting the list in order', () => {
    it('puts the most recently worked on first', () => {
        const ordered = orderProjects([
            project({ name: 'Older', updatedAt: '2026-09-01T10:00:00+00:00' }),
            project({ name: 'Newer', updatedAt: '2026-09-07T10:00:00+00:00' }),
        ]);

        expect(names(ordered)).toEqual(['Newer', 'Older']);
    });

    it('sorts by name, and by when it was started', () => {
        const projects = [
            project({ name: 'Bedroom', createdAt: '2026-09-05T10:00:00+00:00' }),
            project({ name: 'Attic', createdAt: '2026-09-07T10:00:00+00:00' }),
        ];

        expect(names(orderProjects(projects, { order: 'name' }))).toEqual(['Attic', 'Bedroom']);
        expect(names(orderProjects(projects, { order: 'created' }))).toEqual(['Attic', 'Bedroom']);
    });

    /*
     * These are ISO 8601 with an offset. Two written in different offsets sort by their text in
     * the wrong order, which is why the comparator parses them.
     */
    it('compares two times rather than two strings', () => {
        const ordered = orderProjects([
            project({ name: 'Noon in Lisbon', updatedAt: '2026-09-07T12:00:00+01:00' }),
            project({ name: 'An hour later', updatedAt: '2026-09-07T12:00:00+00:00' }),
        ]);

        expect(names(ordered)).toEqual(['An hour later', 'Noon in Lisbon']);
    });

    it('never reorders the array it was given', () => {
        const projects = [project({ name: 'Older' }), project({ name: 'Newer' })];
        orderProjects(projects, { order: 'name' });

        expect(names(projects)).toEqual(['Older', 'Newer']);
    });
});

describe('finding one by typing', () => {
    const projects = [
        project({ name: 'Casa Pátio' }),
        project({ name: 'Bedroom' }),
        project({ name: 'Warehouse', role: 'editor', ownerName: 'Estúdio Sul' }),
    ];

    it('matches part of a name, in any case', () => {
        expect(names(orderProjects(projects, { query: 'bed' }))).toEqual(['Bedroom']);
        expect(names(orderProjects(projects, { query: 'ROOM' }))).toEqual(['Bedroom']);
    });

    // The accent is the slow way to reach a drawing, and not always on the keyboard in use.
    it('matches without the accents', () => {
        expect(names(orderProjects(projects, { query: 'patio' }))).toEqual(['Casa Pátio']);
        expect(names(orderProjects(projects, { query: 'Pátio' }))).toEqual(['Casa Pátio']);
    });

    it('matches on whose it is, since that is a thing somebody types', () => {
        expect(names(orderProjects(projects, { query: 'estudio' }))).toEqual(['Warehouse']);
    });

    it('treats a blank query as no query', () => {
        expect(orderProjects(projects, { query: '   ' })).toHaveLength(3);
    });
});

describe('the sections a person thinks in', () => {
    it('keeps one person’s own drawings in one unheaded list', () => {
        const groups = arrangeProjects([project({ name: 'Bedroom' }), project({ name: 'Attic' })]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.id).toBe('yours');
    });

    it('separates your own work, each firm’s, and what you were let into', () => {
        const groups = arrangeProjects([
            project({ name: 'Bedroom' }),
            project({ name: 'Rua Aurora', organisationId: 'o2', ownerName: 'Estúdio Sul' }),
            project({ name: 'Warehouse', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
            project({ name: 'Ana’s flat', role: 'editor', ownerName: 'Ana' }),
        ]);

        expect(groups.map((group) => group.name)).toEqual([
            'Yours',
            'Ateliê Norte',
            'Estúdio Sul',
            'Shared with you',
        ]);
        expect(names(groups[1]?.projects ?? [])).toEqual(['Warehouse']);
    });

    // The heading of a firm's section leads to the firm; the other two lead nowhere, because
    // "Yours" and "Shared with you" are not places.
    it('carries the firm a section is, and nothing for the sections that are not one', () => {
        const groups = arrangeProjects([
            project({ name: 'Bedroom' }),
            project({ name: 'Warehouse', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
            project({ name: 'Ana’s flat', role: 'editor', ownerName: 'Ana' }),
        ]);

        expect(groups.map((group) => group.organisationId)).toEqual([null, 'o1', null]);
    });

    // Which headings are somebody's name, so the rows under them need not say it again.
    it('marks the sections whose heading is the owner’s name', () => {
        const groups = arrangeProjects([
            project({ name: 'Bedroom' }),
            project({ name: 'Warehouse', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
            project({ name: 'Ana’s flat', role: 'editor', ownerName: 'Ana' }),
        ]);

        expect(groups.map((group) => group.namesOwner)).toEqual([false, true, false]);
    });

    /*
     * A firm's drawing you were let into by a link is not filed under that firm: you are not
     * in it, and what you hold there was granted rather than owned.
     */
    it('files a firm’s drawing you only hold a role in under what you were given', () => {
        const groups = arrangeProjects([
            project({
                name: 'Competition',
                role: 'commenter',
                organisationId: 'o9',
                ownerName: 'A firm you are not in',
            }),
        ]);

        expect(groups.map((group) => group.id)).toEqual(['shared']);
    });

    it('drops a section with nothing in it, filter or no filter', () => {
        const projects = [
            project({ name: 'Bedroom' }),
            project({ name: 'Warehouse', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
        ];

        expect(arrangeProjects(projects, { query: 'ware' }).map((group) => group.name)).toEqual([
            'Ateliê Norte',
        ]);
    });

    it('sorts inside each section rather than across them', () => {
        const groups = arrangeProjects(
            [
                project({ name: 'Zinc', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
                project({ name: 'Attic' }),
                project({ name: 'Awning', organisationId: 'o1', ownerName: 'Ateliê Norte' }),
            ],
            { order: 'name' },
        );

        expect(names(groups[0]?.projects ?? [])).toEqual(['Attic']);
        expect(names(groups[1]?.projects ?? [])).toEqual(['Awning', 'Zinc']);
    });
});

describe('what has been put away', () => {
    it('knows an archived project from a live one', () => {
        expect(isArchived(project())).toBe(false);
        expect(isArchived(project({ archivedAt: '2026-09-01T10:00:00+00:00' }))).toBe(true);
    });

    it('splits the list without reordering either half', () => {
        const { live, archived } = partitionArchived([
            project({ name: 'Live one' }),
            project({ name: 'Put away', archivedAt: '2026-09-01T10:00:00+00:00' }),
            project({ name: 'Live two' }),
        ]);

        expect(names(live)).toEqual(['Live one', 'Live two']);
        expect(names(archived)).toEqual(['Put away']);
    });
});
