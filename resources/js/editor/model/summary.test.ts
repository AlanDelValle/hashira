import { describe, expect, it } from 'vitest';

import { summarize } from './summary';

describe('summarize', () => {
    it('reads settings, layers and element count from a well-formed document', () => {
        const summary = summarize({
            schemaVersion: 1,
            settings: { unit: 'cm', scale: 100 },
            layers: [
                { id: 'layer_architecture', name: 'Architecture', visible: true, locked: false },
                { id: 'layer_openings', name: 'Openings', visible: false, locked: true },
            ],
            elements: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        });

        expect(summary.schemaVersion).toBe(1);
        expect(summary.unit).toBe('cm');
        expect(summary.scale).toBe(100);
        expect(summary.elementCount).toBe(3);
        expect(summary.layers).toEqual([
            { id: 'layer_architecture', name: 'Architecture', visible: true, locked: false },
            { id: 'layer_openings', name: 'Openings', visible: false, locked: true },
        ]);
    });

    it('falls back to metric defaults rather than throwing on nonsense', () => {
        for (const input of [null, undefined, 42, 'a plan', [], {}]) {
            const summary = summarize(input);

            expect(summary.unit).toBe('m');
            expect(summary.scale).toBe(50);
            expect(summary.layers).toEqual([]);
            expect(summary.elementCount).toBe(0);
        }
    });

    it('drops individually malformed layers instead of the whole list', () => {
        const summary = summarize({
            layers: [{ id: 'ok', name: 'Kept' }, { name: 'no id' }, null, 'nope'],
        });

        expect(summary.layers).toEqual([{ id: 'ok', name: 'Kept', visible: true, locked: false }]);
    });

    it('rejects a non-positive scale', () => {
        expect(summarize({ settings: { scale: 0 } }).scale).toBe(50);
        expect(summarize({ settings: { scale: -20 } }).scale).toBe(50);
    });
});
