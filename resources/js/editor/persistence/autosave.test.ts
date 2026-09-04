import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addElements } from '@/editor/commands/command';
import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createRect } from '@/editor/model/factories';
import type { HashiraDocument } from '@/editor/model/types';
import { history, runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { ApiError } from '@/lib/api';

import { AutosaveController, type DocumentGateway } from './autosave';

const LAYER = 'layer_architecture';

/** Records every save and lets each test decide how the server answers. */
function recordingGateway() {
    const calls: { revision: number; data: HashiraDocument }[] = [];
    let answer: (revision: number) => Promise<number> = (revision) => Promise.resolve(revision + 1);

    const gateway: DocumentGateway = {
        save(_projectId, revision, data) {
            calls.push({ revision, data });

            return answer(revision);
        },
    };

    return {
        gateway,
        calls,
        answerWith(next: (revision: number) => Promise<number>) {
            answer = next;
        },
    };
}

function draw() {
    runCommand(addElements([createRect(point(0, 0), point(100, 100), LAYER)]));
}

describe('autosave', () => {
    let controller: AutosaveController;
    let server: ReturnType<typeof recordingGateway>;

    beforeEach(() => {
        vi.useFakeTimers();

        useDocumentStore.setState({ document: emptyDocument(), dropped: [], error: null });
        history.clear();

        server = recordingGateway();
        controller = new AutosaveController(server.gateway, () => 1_000);
        controller.start('project-1', 4, useDocumentStore.getState().document);
    });

    afterEach(() => {
        controller.stop();
        vi.useRealTimers();
    });

    it('starts clean and stays quiet until something changes', async () => {
        expect(controller.getStatus()).toEqual({ kind: 'idle' });
        expect(controller.isDirty()).toBe(false);

        await vi.advanceTimersByTimeAsync(60_000);

        expect(server.calls).toHaveLength(0);
    });

    it('waits for a burst of edits to settle, then saves once', async () => {
        draw();
        expect(controller.getStatus()).toEqual({ kind: 'editing' });

        await vi.advanceTimersByTimeAsync(400);
        draw();
        await vi.advanceTimersByTimeAsync(400);
        draw();

        // Still inside the debounce: three edits, no request yet.
        expect(server.calls).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1_200);

        expect(server.calls).toHaveLength(1);
        expect(controller.getStatus()).toMatchObject({ kind: 'saved' });
        expect(controller.isDirty()).toBe(false);
    });

    it('sends the revision the server gave back, not the one it started with', async () => {
        draw();
        await vi.advanceTimersByTimeAsync(1_200);
        expect(server.calls[0]?.revision).toBe(4);

        draw();
        await vi.advanceTimersByTimeAsync(1_200);
        expect(server.calls[1]?.revision).toBe(5);
    });

    it('still saves during continuous drawing, on the ceiling', async () => {
        // An edit every second against a 1.2 s debounce: the debounce never expires on its
        // own, so without a ceiling this drawing would never be saved at all.
        for (let i = 0; i < 8; i++) {
            draw();
            await vi.advanceTimersByTimeAsync(1_000);
        }

        expect(server.calls).toHaveLength(0);

        // Past the 10 s ceiling, the save goes out regardless of the still-moving pointer.
        for (let i = 0; i < 4; i++) {
            draw();
            await vi.advanceTimersByTimeAsync(1_000);
        }

        expect(server.calls).toHaveLength(1);
    });

    it('keeps one request in flight and folds later edits into a single follow-up', async () => {
        // Held in an object: assigning to a bare `let` inside the executor leaves TypeScript
        // believing it is still null at the call site below.
        const outstanding: { release: (() => void) | null } = { release: null };

        server.answerWith(
            (revision) =>
                new Promise<number>((resolve) => {
                    outstanding.release = () => {
                        resolve(revision + 1);
                    };
                }),
        );

        draw();
        await vi.advanceTimersByTimeAsync(1_200);
        expect(server.calls).toHaveLength(1);

        // Three more edits while the first save is still outstanding.
        draw();
        draw();
        draw();
        await vi.advanceTimersByTimeAsync(5_000);

        expect(server.calls).toHaveLength(1);

        server.answerWith((revision) => Promise.resolve(revision + 1));
        outstanding.release?.();
        await vi.advanceTimersByTimeAsync(1_200);

        expect(server.calls).toHaveLength(2);
        expect(controller.isDirty()).toBe(false);
    });

    it('saves immediately when flushed', async () => {
        draw();
        controller.flush();
        await vi.advanceTimersByTimeAsync(0);

        expect(server.calls).toHaveLength(1);
    });

    it('retries a failed save with a growing delay', async () => {
        server.answerWith(() => Promise.reject(new Error('offline')));

        draw();
        await vi.advanceTimersByTimeAsync(1_200);

        expect(server.calls).toHaveLength(1);
        expect(controller.getStatus()).toMatchObject({ kind: 'error' });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(server.calls).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(2_000);
        expect(server.calls).toHaveLength(2); // the second wait is longer

        await vi.advanceTimersByTimeAsync(2_000);
        expect(server.calls).toHaveLength(3);
    });

    it('recovers once the server comes back', async () => {
        server.answerWith(() => Promise.reject(new Error('offline')));

        draw();
        await vi.advanceTimersByTimeAsync(1_200);
        expect(controller.getStatus()).toMatchObject({ kind: 'error' });

        server.answerWith((revision) => Promise.resolve(revision + 1));
        await vi.advanceTimersByTimeAsync(2_000);

        expect(controller.getStatus()).toMatchObject({ kind: 'saved' });
        expect(controller.isDirty()).toBe(false);
    });

    it('stops on a conflict rather than overwriting the other version', async () => {
        server.answerWith(() => Promise.reject(new ApiError(409, 'Saved elsewhere')));

        draw();
        await vi.advanceTimersByTimeAsync(1_200);

        expect(controller.getStatus()).toMatchObject({ kind: 'conflict' });

        const afterConflict = server.calls.length;

        // Neither time nor further editing may resume writing over the other version.
        draw();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(server.calls).toHaveLength(afterConflict);
        expect(controller.getStatus()).toMatchObject({ kind: 'conflict' });
    });

    /*
     * A conflict means somebody else's snapshot landed first. On its own that is unrecoverable
     * — their work is not in this drawing and writing over it would lose it. While the edits
     * are being logged it is the opposite: their change already arrived as an operation, so
     * the only stale thing was the number.
     */
    it('writes again from the current revision when the edits are being logged', async () => {
        // The suite's own controller is watching the same drawing; two savers would make
        // "the last call" mean whichever of them went second.
        controller.stop();

        const coEditing = new AutosaveController(
            server.gateway,
            () => 1_000,
            () => true,
        );

        coEditing.start('project-1', 4, useDocumentStore.getState().document);

        let refused = false;

        server.answerWith((revision) => {
            if (!refused) {
                refused = true;

                return Promise.reject(
                    new ApiError(409, 'Saved elsewhere', {}, { currentRevision: 9 }),
                );
            }

            return Promise.resolve(revision + 1);
        });

        draw();
        await vi.advanceTimersByTimeAsync(1_200);

        expect(coEditing.getStatus()).toMatchObject({ kind: 'saved' });

        // The second attempt is made from the number the server said was current.
        expect(server.calls.at(-1)?.revision).toBe(9);

        coEditing.stop();
    });

    it('gives up reconciling rather than racing for ever', async () => {
        controller.stop();

        const coEditing = new AutosaveController(
            server.gateway,
            () => 1_000,
            () => true,
        );

        coEditing.start('project-1', 4, useDocumentStore.getState().document);

        server.answerWith(() =>
            Promise.reject(new ApiError(409, 'Saved elsewhere', {}, { currentRevision: 9 })),
        );

        draw();
        await vi.advanceTimersByTimeAsync(1_200);

        expect(coEditing.getStatus()).toMatchObject({ kind: 'conflict' });

        coEditing.stop();
    });

    it('lets go of the drawing when stopped', async () => {
        controller.stop();

        draw();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(server.calls).toHaveLength(0);
    });
});
