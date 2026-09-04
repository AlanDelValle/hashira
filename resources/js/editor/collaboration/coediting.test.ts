import { describe, expect, it } from 'vitest';

import { readOperation } from './coediting';

const SELF = 'this-browser';

/*
 * The rules an arriving edit is held to. All of them are about ordering and provenance, which
 * is why they live in a function rather than inside a socket handler: neither can be checked
 * by looking at a screen.
 */
describe('an edit arriving from somewhere else', () => {
    it('is applied when it is newer and came from another browser', () => {
        expect(
            readOperation({ sequence: 4, origin: 'other', envelope: { type: 'x' } }, 3, SELF),
        ).toEqual({ kind: 'apply', sequence: 4, envelope: { type: 'x' } });
    });

    /*
     * The channel delivers in the order the log accepted, so a number at or below what has
     * been seen is a repeat — and acting on it would put back a state the drawing has already
     * moved past.
     */
    it.each([3, 2, 0])('is ignored when its number is %i and 3 has been seen', (sequence) => {
        expect(readOperation({ sequence, origin: 'other', envelope: {} }, 3, SELF)).toEqual({
            kind: 'ignore',
        });
    });

    it('is counted but not applied when it is our own coming back', () => {
        expect(readOperation({ sequence: 9, origin: SELF, envelope: {} }, 3, SELF)).toEqual({
            kind: 'seen',
            sequence: 9,
        });
    });

    /*
     * Two tabs of one person are two editors. The origin is the browser, not the account,
     * precisely so each sees the other's work arrive.
     */
    it('is applied when it came from the same person in another browser', () => {
        expect(
            readOperation({ sequence: 4, origin: 'other-tab', envelope: {} }, 3, SELF).kind,
        ).toBe('apply');
    });

    it.each([
        ['nothing at all', null],
        ['a string', 'edit'],
        ['no sequence', { origin: 'other', envelope: {} }],
        ['a sequence that is not a number', { sequence: '4', origin: 'other', envelope: {} }],
        ['an infinite sequence', { sequence: Number.POSITIVE_INFINITY, origin: 'o', envelope: {} }],
    ])('is ignored when it is %s', (_case, payload) => {
        expect(readOperation(payload, 3, SELF)).toEqual({ kind: 'ignore' });
    });

    /*
     * A missing envelope still advances the count. Refusing to move past a message that cannot
     * be read would stall everything behind it for ever; `parseCommand` drops it a moment
     * later, and the drawing carries on from the next one.
     */
    it('advances past a message with nothing readable in it', () => {
        expect(readOperation({ sequence: 4, origin: 'other' }, 3, SELF)).toEqual({
            kind: 'apply',
            sequence: 4,
            envelope: undefined,
        });
    });
});
