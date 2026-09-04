import { describe, expect, it } from 'vitest';

import { readTheme } from '@/editor/render/theme';
import { cursorColour } from '@/editor/render/presence';
import type { PresenceMember } from '@/editor/store/presenceStore';

import { readCursor } from './presence';

const MEMBERS: PresenceMember[] = [
    { id: 7, name: 'Ana' },
    { id: 12, name: 'Bruno' },
];

/*
 * A whisper comes from another browser, so it is read rather than trusted. These are the rules
 * that reading applies, and they are the reason this is a function rather than four lines
 * inside a socket handler.
 */
describe('reading a cursor off the wire', () => {
    it('takes a position from somebody on the channel', () => {
        expect(readCursor({ userId: 7, x: 100, y: -250.5 }, MEMBERS)).toEqual({
            userId: 7,
            name: 'Ana',
            at: { x: 100, y: -250.5 },
        });
    });

    it('takes the name from the channel, not from the message', () => {
        const cursor = readCursor({ userId: 7, x: 0, y: 0, name: 'The Owner' }, MEMBERS);

        expect(cursor?.name).toBe('Ana');
    });

    it('ignores a cursor claiming somebody who is not here', () => {
        expect(readCursor({ userId: 99, x: 0, y: 0 }, MEMBERS)).toBeNull();
    });

    it.each([
        ['no payload at all', null],
        ['a string', 'over here'],
        ['a missing position', { userId: 7 }],
        ['a position that is not a number', { userId: 7, x: '10', y: 0 }],
        ['an infinite position', { userId: 7, x: Number.POSITIVE_INFINITY, y: 0 }],
        ['a NaN position', { userId: 7, x: 0, y: Number.NaN }],
    ])('drops %s', (_case, payload) => {
        expect(readCursor(payload, MEMBERS)).toBeNull();
    });
});

describe('which colour a person is', () => {
    const theme = readTheme(document.documentElement);

    it('gives the same person the same colour every time', () => {
        expect(cursorColour(theme, 7)).toBe(cursorColour(theme, 7));
    });

    it('spreads five accounts across five colours', () => {
        const colours = new Set([1, 2, 3, 4, 5].map((id) => cursorColour(theme, id)));

        expect(colours.size).toBe(5);
    });

    it('cycles rather than running out', () => {
        expect(cursorColour(theme, 6)).toBe(cursorColour(theme, 1));
    });
});
