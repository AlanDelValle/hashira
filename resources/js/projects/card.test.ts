import { describe, expect, it } from 'vitest';

import { describeAccess, describeDrawing } from '@/projects/card';
import type { DrawingSummary, ProjectSummary } from '@/types/api';

function drawing(overrides: Partial<DrawingSummary> = {}): DrawingSummary {
    return { sheet: 'A3', scale: 50, elements: 14, layers: 5, sheets: 1, ...overrides };
}

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
    return {
        id: 'p1',
        name: 'Bedroom',
        description: null,
        createdAt: '2026-09-01T10:00:00+00:00',
        updatedAt: '2026-09-08T10:00:00+00:00',
        role: 'owner',
        organisationId: null,
        ...overrides,
    };
}

describe('what a card says about the drawing', () => {
    it('reads it the way the status bar does', () => {
        expect(describeDrawing(drawing())).toBe('A3 · 1:50 · 14 elements · 5 layers');
    });

    it('says how many sheets only once there is more than one', () => {
        expect(describeDrawing(drawing({ sheets: 4 }))).toContain('4 sheets');
        expect(describeDrawing(drawing({ sheets: 1 }))).not.toContain('sheet');
    });

    // A drawing with one of anything is not "1 elements".
    it('counts one of a thing in the singular', () => {
        expect(describeDrawing(drawing({ elements: 1, layers: 1 }))).toBe(
            'A3 · 1:50 · 1 element · 1 layer',
        );
    });

    /*
     * Every project is empty for its first minutes, and "0 elements · 5 layers" reads as a
     * fault rather than as a new drawing.
     */
    it('says a new drawing is empty rather than counting nothing', () => {
        expect(describeDrawing(drawing({ elements: 0 }))).toBe('A3 · 1:50 · nothing drawn yet');
    });

    it('leaves out what the server could not count', () => {
        expect(describeDrawing(drawing({ sheet: null, scale: null, layers: null }))).toBe(
            '14 elements',
        );
    });

    it('says nothing at all about a project with no drawing', () => {
        expect(describeDrawing(null)).toBeNull();
        expect(describeDrawing(undefined)).toBeNull();
        expect(
            describeDrawing({
                sheet: null,
                scale: null,
                elements: null,
                layers: null,
                sheets: null,
            }),
        ).toBeNull();
    });

    // Scales are plotted as ratios, and 1:50.0 is not how anybody writes one.
    it('writes a whole scale without a decimal point', () => {
        expect(describeDrawing(drawing({ scale: 100 }))).toContain('1:100');
        expect(describeDrawing(drawing({ scale: 12.5 }))).toContain('1:12.5');
    });
});

describe('what a card says about who can reach it', () => {
    it('says nothing about your own unshared drawing', () => {
        expect(describeAccess(project())).toEqual([]);
    });

    it('names the firm whose drawing it is, since an admin holds owner in both', () => {
        expect(
            describeAccess(project({ organisationId: 'o1', ownerName: 'Ateliê Norte' })),
        ).toEqual(['Ateliê Norte']);
    });

    it('says whose it is and what you hold in somebody else’s', () => {
        expect(describeAccess(project({ role: 'editor', ownerName: 'Ana' }))).toEqual([
            'Ana’s',
            'you can edit',
        ]);
        expect(describeAccess(project({ role: 'commenter', ownerName: 'Ana' }))).toEqual([
            'Ana’s',
            'you can comment',
        ]);
    });

    it('says what the link hands out rather than only that there is one', () => {
        expect(describeAccess(project({ sharedRole: 'editor' }))).toEqual(['link · editor']);
        expect(describeAccess(project({ sharedRole: 'viewer' }))).toEqual(['link · viewer']);
    });

    /*
     * 10.2c's state, which the card has never said, and 9.4's decision that a link keeps
     * working on a restricted drawing. They are different facts and both are printed.
     */
    it('says a restricted drawing is restricted, link or no link', () => {
        expect(
            describeAccess(
                project({ organisationId: 'o1', ownerName: 'Ateliê Norte', restricted: true }),
            ),
        ).toEqual(['Ateliê Norte', 'named people only']);

        expect(
            describeAccess(
                project({
                    organisationId: 'o1',
                    ownerName: 'Ateliê Norte',
                    restricted: true,
                    sharedRole: 'commenter',
                }),
            ),
        ).toEqual(['Ateliê Norte', 'named people only', 'link · commenter']);
    });

    it('counts the conversations still waiting for an answer, and only those', () => {
        expect(describeAccess(project({ openComments: 3 }))).toEqual(['3 open remarks']);
        expect(describeAccess(project({ openComments: 1 }))).toEqual(['1 open remark']);
        expect(describeAccess(project({ openComments: 0 }))).toEqual([]);
    });
});
