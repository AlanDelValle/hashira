import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createWall } from '@/editor/model/factories';
import type { Element, HashiraDocument } from '@/editor/model/types';
import * as versions from '@/editor/persistence/versions';
import { history, useDocumentStore } from '@/editor/store/documentStore';

import { VersionsDialog } from './VersionsDialog';

vi.mock('@/editor/persistence/versions');

/*
 * jsdom has neither of the two things the review canvas asks the platform for. A missing 2D
 * context the surface already copes with — it paints nothing and says nothing — so only the
 * observer has to be stood in for.
 */
class NoResizes {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

const LAYER = 'layer_architecture';
const MADE_AT = { createdAt: '2026-03-14T09:00:00.000Z' };

function wall(id: string, to = point(4000, 0)): Element {
    return { ...createWall(point(0, 0), to, LAYER), id, metadata: MADE_AT };
}

function documentWith(elements: Element[]): HashiraDocument {
    return { ...emptyDocument('Ground floor'), id: 'doc', elements };
}

/** One wall in the older version, two in the newer and in the drawing as it stands. */
const OLDEST = documentWith([wall('w1')]);
const NEWEST = documentWith([wall('w1'), wall('w2', point(0, 3000))]);

const SUMMARIES: versions.VersionSummary[] = [
    {
        id: 'v2',
        label: 'After the rework',
        schemaVersion: 6,
        revision: 9,
        createdAt: '2026-08-30T09:00:00.000Z',
        author: 'Demo',
    },
    {
        id: 'v1',
        label: 'Before the rework',
        schemaVersion: 6,
        revision: 4,
        createdAt: '2026-08-29T09:00:00.000Z',
        author: 'Demo',
    },
];

function open() {
    return render(<VersionsDialog projectId="p1" open onOpenChange={() => {}} />);
}

describe('the versions dialog', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', NoResizes);

        // jsdom has no canvas to hand out, and says so loudly once per render. The surface
        // already copes with not getting one; this only stops the noise.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

        useDocumentStore.setState({ document: NEWEST, dropped: [], error: null });
        history.clear();

        vi.mocked(versions.listVersions).mockResolvedValue(SUMMARIES);
        vi.mocked(versions.fetchVersion).mockImplementation((_project, id) =>
            Promise.resolve({
                ...(SUMMARIES.find((version) => version.id === id) ?? SUMMARIES[0]!),
                drawing: id === 'v1' ? OLDEST : NEWEST,
            }),
        );
    });

    it('lists every saved version, with the drawing as it stands at the top', async () => {
        open();

        expect(await screen.findByText('After the rework')).toBeInTheDocument();
        expect(screen.getByText('Before the rework')).toBeInTheDocument();
        expect(screen.getByText('Current drawing')).toBeInTheDocument();
    });

    it('opens on what has changed since the last version was saved', async () => {
        open();

        // The current drawing against v2, which holds the same two walls: nothing has moved
        // since that snapshot, and saying so is the answer to the question that was asked.
        expect(await screen.findByText(/These two versions are identical/)).toBeInTheDocument();
        expect(await screen.findByRole('combobox', { name: 'Changes since' })).toHaveValue('v2');
    });

    it('compares a version against the one before it when you pick it', async () => {
        const user = userEvent.setup();

        open();
        await user.click(await screen.findByText('After the rework'));

        // v2 against v1: the second wall was drawn between them.
        expect(await screen.findByRole('combobox', { name: 'Changes since' })).toHaveValue('v1');
        expect(await screen.findByRole('button', { name: /Wall.*Drawn/ })).toBeInTheDocument();
    });

    it('stops comparing when asked to compare against nothing', async () => {
        const user = userEvent.setup();

        open();
        await user.selectOptions(
            await screen.findByRole('combobox', { name: 'Changes since' }),
            '',
        );

        expect(await screen.findByText(/Nothing to compare against/)).toBeInTheDocument();
    });

    it('will not restore the drawing that is already open', async () => {
        open();

        expect(await screen.findByRole('button', { name: 'Restore this version' })).toBeDisabled();
    });

    it('restores the version on show, through a command that undoes', async () => {
        const user = userEvent.setup();

        open();
        await user.click(await screen.findByText('Before the rework'));
        await user.click(await screen.findByRole('button', { name: 'Restore this version' }));

        expect(useDocumentStore.getState().document.elements).toHaveLength(1);

        history.undo();

        expect(useDocumentStore.getState().document.elements).toHaveLength(2);
    });
});
