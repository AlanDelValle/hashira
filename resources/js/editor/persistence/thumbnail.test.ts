import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addElements } from '@/editor/commands/command';
import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createRect } from '@/editor/model/factories';
import { history, runCommand, useDocumentStore } from '@/editor/store/documentStore';

import { ThumbnailController } from './thumbnail';

const LAYER = 'layer_architecture';

function draw() {
    runCommand(addElements([createRect(point(0, 0), point(100, 100), LAYER)]));
}

describe('the picture the projects list shows', () => {
    let sent: Blob[];
    let controller: ThumbnailController;
    let drawn: () => Promise<Blob | null>;

    beforeEach(() => {
        vi.useFakeTimers();

        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        sent = [];
        drawn = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));

        controller = new ThumbnailController(
            (_projectId, png) => {
                sent.push(png);

                return Promise.resolve();
            },
            () => drawn(),
        );
    });

    afterEach(() => {
        controller.stop();
        vi.useRealTimers();
    });

    /*
     * What gives a picture to every drawing that existed before any of this was built, and what
     * lets a stale one repair itself: opening a plan is enough.
     */
    it('writes one shortly after the drawing opens, without being edited', async () => {
        controller.start('project-1');

        await vi.advanceTimersByTimeAsync(4_000);

        expect(sent).toHaveLength(1);
    });

    it('writes again once a burst of drawing has settled', async () => {
        controller.start('project-1');
        await vi.advanceTimersByTimeAsync(4_000);

        draw();
        await vi.advanceTimersByTimeAsync(5_000);
        draw();
        await vi.advanceTimersByTimeAsync(5_000);

        // Still inside the settle window that the second edit restarted.
        expect(sent).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(20_000);

        expect(sent).toHaveLength(2);
    });

    // An empty sheet has nothing to photograph, and a blank rectangle pretending to be a plan
    // is worse than a card with no picture on it.
    it('sends nothing at all for a drawing with nothing on it', async () => {
        drawn = () => Promise.resolve(null);
        controller.start('project-1');

        await vi.advanceTimersByTimeAsync(4_000);

        expect(sent).toHaveLength(0);
    });

    /*
     * The whole reason this runs beside the autosave rather than inside it. A picture that
     * could not be made or could not be sent is not news, and must not become one.
     */
    it('swallows a failure and tries again next time the drawing settles', async () => {
        drawn = () => Promise.reject(new Error('no canvas here'));
        controller.start('project-1');

        // Nothing thrown, nothing reported, nothing sent. An unhandled rejection here would
        // fail this run, which is the assertion that matters.
        await vi.advanceTimersByTimeAsync(4_000);

        expect(sent).toHaveLength(0);

        drawn = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));
        draw();
        await vi.advanceTimersByTimeAsync(20_000);

        expect(sent).toHaveLength(1);
    });

    it('stops watching the drawing it was told to stop watching', async () => {
        controller.start('project-1');
        await vi.advanceTimersByTimeAsync(4_000);
        controller.stop();

        draw();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(sent).toHaveLength(1);
    });
});
