import { describe, expect, it } from 'vitest';

import { parseDocument } from './document';
import { DEFAULT_LINE_TYPE, LINE_TYPES, LINE_WEIGHTS, findLineType } from './lineTypes';
import { emptyDocument } from './document';
import type { LineType } from './types';

/**
 * The shelf held to its own rules.
 *
 * Eight conventions cannot be read through on every change, and the mistakes that matter are
 * dull ones: an id used twice, a pattern that ends on a gap, a type the parser will not accept
 * back. The same reason the block library has a test of its own.
 */

describe('the line types', () => {
    it('names each one once', () => {
        const ids = LINE_TYPES.map((type) => type.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('is the eight of the standard that are a line rather than a block', () => {
        expect(LINE_TYPES).toHaveLength(8);
    });

    it('draws every one of them at a weight of the group', () => {
        for (const type of LINE_TYPES) {
            expect(LINE_WEIGHTS[type.weight]).toBeGreaterThan(0);
        }
    });

    /*
     * A pattern is read in pairs — so much ink, then so much paper — so an odd number of
     * lengths repeats out of phase and draws a different line each time round.
     */
    it('gives every pattern a gap for every mark', () => {
        for (const type of LINE_TYPES) {
            if (type.dash === null) continue;

            expect(type.dash.length % 2, type.id).toBe(0);
            expect(Math.min(...type.dash), type.id).toBeGreaterThan(0);
        }
    });

    it('leaves the continuous ones with no pattern at all', () => {
        for (const type of LINE_TYPES) {
            expect(type.dash === null, type.id).toBe(type.id.startsWith('continuous-'));
        }
    });

    /*
     * The three weights are a row of the standard's table and not three numbers that look
     * about right: group 0,25 is estreita 0,13, larga 0,25, extralarga 0,50. Doubling is the
     * idea and the table is the authority — 0,13 is the rounded half that the preferred series
     * gives, not 0,125 — so what is asserted is the row itself.
     */
    it('holds the three weights to the row of the table they came from', () => {
        expect(LINE_WEIGHTS).toEqual({ narrow: 0.13, wide: 0.25, 'extra-wide': 0.5 });
        expect(LINE_WEIGHTS['extra-wide']).toBeCloseTo(LINE_WEIGHTS.wide * 2);
    });

    it('defaults to the one the drawing was always drawn with', () => {
        expect(findLineType(DEFAULT_LINE_TYPE)?.weight).toBe('wide');
        expect(findLineType(DEFAULT_LINE_TYPE)?.dash).toBeNull();
        expect(LINE_WEIGHTS.wide).toBe(0.25);
    });

    /*
     * The parser lists the types itself rather than importing them, the way it lists the
     * hatches. That is the drift this catches: a ninth type added here and not there is a type
     * the editor can draw and cannot save.
     */
    it('is accepted, every one of them, by the document parser', () => {
        for (const type of LINE_TYPES) {
            const blank = emptyDocument('Line types');
            const raw = {
                ...blank,
                elements: [
                    {
                        id: 'el_line',
                        type: 'line',
                        layerId: blank.layers[0]?.id,
                        transform: { x: 0, y: 0, rotation: 0 },
                        geometry: { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
                        style: { lineType: type.id },
                    },
                ],
            };

            const parsed = parseDocument(raw);

            expect(parsed.ok, type.id).toBe(true);
            expect(parsed.ok && parsed.document.elements[0]?.style?.lineType, type.id).toBe(
                type.id,
            );
        }
    });

    it('refuses one nobody has defined', () => {
        const blank = emptyDocument('Line types');
        const raw = {
            ...blank,
            elements: [
                {
                    id: 'el_line',
                    type: 'line',
                    layerId: blank.layers[0]?.id,
                    transform: { x: 0, y: 0, rotation: 0 },
                    geometry: { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
                    style: { lineType: 'squiggly' as LineType },
                },
            ],
        };

        const parsed = parseDocument(raw);

        expect(parsed.ok && parsed.dropped).toHaveLength(1);
    });
});
