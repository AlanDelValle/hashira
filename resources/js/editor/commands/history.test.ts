import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { translateElement, makeLookup } from '@/editor/model/elements';
import { createLine, createRect } from '@/editor/model/factories';
import type { Element, HashiraDocument } from '@/editor/model/types';

import { addElements, deleteElements, replaceElements } from './command';
import { HistoryStack, type DocumentPort } from './history';

const LAYER = 'layer_architecture';

function emptyDocument(elements: Element[] = []): HashiraDocument {
    return {
        schemaVersion: 1,
        id: 'doc',
        name: 'Test',
        settings: {
            unit: 'm',
            scale: 50,
            grid: { size: 100, subdivisions: 2, visible: true, snap: true },
            snapping: {
                enabled: true,
                endpoint: true,
                midpoint: true,
                intersection: true,
                axis: true,
            },
            sheets: [
                {
                    id: 'sheet_1',
                    name: 'Sheet 1',
                    size: 'A3',
                    orientation: 'landscape',
                    scale: 50,
                    centre: null,
                },
            ],
            title: 'Test',
            titleBlock: { project: '', client: '', drawnBy: '', revision: '', date: '' },
            notes: '',
        },
        layers: defaultLayers(),
        elements,
    };
}

describe('history', () => {
    let document: HashiraDocument;
    let port: DocumentPort;
    let clock: number;
    let history: HistoryStack;

    beforeEach(() => {
        document = emptyDocument();
        port = {
            get: () => document,
            set: (next) => {
                document = next;
            },
        };
        clock = 1000;
        history = new HistoryStack(port, () => clock);
    });

    it('adds and takes back', () => {
        const line = createLine(point(0, 0), point(1000, 0), LAYER);

        history.execute(addElements([line]));
        expect(document.elements).toHaveLength(1);

        history.undo();
        expect(document.elements).toHaveLength(0);

        history.redo();
        expect(document.elements).toHaveLength(1);
        expect(document.elements[0]?.id).toBe(line.id);
    });

    it('restores a deleted element to its original place in the stack', () => {
        const first = createLine(point(0, 0), point(10, 0), LAYER);
        const middle = createLine(point(0, 10), point(10, 10), LAYER);
        const last = createLine(point(0, 20), point(10, 20), LAYER);

        history.execute(addElements([first, middle, last]));
        history.execute(deleteElements([middle.id]));

        expect(document.elements.map((e) => e.id)).toEqual([first.id, last.id]);

        history.undo();
        expect(document.elements.map((e) => e.id)).toEqual([first.id, middle.id, last.id]);
    });

    it('restores several deleted elements in order', () => {
        const elements = [
            createLine(point(0, 0), point(10, 0), LAYER),
            createLine(point(0, 10), point(10, 10), LAYER),
            createLine(point(0, 20), point(10, 20), LAYER),
            createLine(point(0, 30), point(10, 30), LAYER),
        ];

        history.execute(addElements(elements));

        const ids = elements.map((element) => element.id);
        history.execute(deleteElements([ids[0]!, ids[2]!]));
        expect(document.elements).toHaveLength(2);

        history.undo();
        expect(document.elements.map((e) => e.id)).toEqual(ids);
    });

    it('reports what the next undo and redo would do', () => {
        expect(history.getState()).toMatchObject({ canUndo: false, canRedo: false });

        history.execute(addElements([createRect(point(0, 0), point(10, 10), LAYER)], 'Rectangle'));

        expect(history.getState()).toMatchObject({ canUndo: true, undoLabel: 'Rectangle' });

        history.undo();
        expect(history.getState()).toMatchObject({ canUndo: false, redoLabel: 'Rectangle' });
    });

    it('merges a continuing edit into one history entry', () => {
        const rect = createRect(point(0, 0), point(400, 200), LAYER);
        history.execute(addElements([rect]));

        const lookup = makeLookup(document.elements);
        let current: Element = rect;

        // Three nudges in quick succession, the way holding an arrow key arrives.
        for (let i = 0; i < 3; i++) {
            const moved = translateElement(current, point(10, 0), lookup);
            history.execute(replaceElements([current], [moved], 'Move', `move:${rect.id}`));
            current = moved;
            clock += 100;
        }

        expect(document.elements[0]?.transform.x).toBeCloseTo(230);

        // One undo returns to where the nudging started, not to the second-to-last nudge.
        history.undo();
        expect(document.elements[0]?.transform.x).toBeCloseTo(200);
    });

    it('does not merge across a pause', () => {
        const rect = createRect(point(0, 0), point(400, 200), LAYER);
        history.execute(addElements([rect]));

        const lookup = makeLookup(document.elements);
        const first = translateElement(rect, point(10, 0), lookup);
        history.execute(replaceElements([rect], [first], 'Move', `move:${rect.id}`));

        clock += 5000;

        const second = translateElement(first, point(10, 0), lookup);
        history.execute(replaceElements([first], [second], 'Move', `move:${rect.id}`));

        history.undo();
        expect(document.elements[0]?.transform.x).toBeCloseTo(210);
    });

    it('does not merge edits to different elements', () => {
        const a = createRect(point(0, 0), point(10, 10), LAYER);
        const b = createRect(point(100, 0), point(110, 10), LAYER);
        history.execute(addElements([a, b]));

        const lookup = makeLookup(document.elements);
        history.execute(
            replaceElements(
                [a],
                [translateElement(a, point(5, 0), lookup)],
                'Move',
                `move:${a.id}`,
            ),
        );
        history.execute(
            replaceElements(
                [b],
                [translateElement(b, point(5, 0), lookup)],
                'Move',
                `move:${b.id}`,
            ),
        );

        history.undo();
        expect(document.elements[1]?.transform.x).toBeCloseTo(105);
        expect(document.elements[0]?.transform.x).toBeCloseTo(10);
    });

    it('drops the redo branch once a new edit lands', () => {
        history.execute(addElements([createRect(point(0, 0), point(10, 10), LAYER)]));
        history.undo();

        expect(history.getState().canRedo).toBe(true);

        history.execute(addElements([createRect(point(50, 50), point(60, 60), LAYER)]));

        expect(history.getState().canRedo).toBe(false);
        expect(document.elements).toHaveLength(1);
    });

    it('survives undo and redo with nothing on the stack', () => {
        expect(history.undo()).toBe(false);
        expect(history.redo()).toBe(false);
        expect(document.elements).toHaveLength(0);
    });

    it('notifies listeners and stops when unsubscribed', () => {
        let calls = 0;
        const unsubscribe = history.subscribe(() => {
            calls += 1;
        });

        history.execute(addElements([createRect(point(0, 0), point(10, 10), LAYER)]));
        expect(calls).toBe(1);

        unsubscribe();
        history.undo();
        expect(calls).toBe(1);
    });
});
