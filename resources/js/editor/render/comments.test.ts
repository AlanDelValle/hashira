import { describe, expect, it } from 'vitest';

import { commentPins } from '@/editor/store/commentsStore';
import type { CommentThread } from '@/types/api';

import { hitsPin, pinAt, pinHead, type CommentPin } from './comments';

/** One screen pixel is one millimetre of world, which makes the sums here readable. */
const PX = 1;

function pin(overrides: Partial<CommentPin> = {}): CommentPin {
    return { id: 'a', at: { x: 0, y: 0 }, resolved: false, number: 1, ...overrides };
}

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
    return {
        id: 'a',
        x: 0,
        y: 0,
        elementId: null,
        resolved: false,
        resolvedAt: null,
        authorId: 1,
        authorName: 'Somebody',
        createdAt: '2026-09-01T10:00:00+00:00',
        comments: [],
        ...overrides,
    };
}

describe('where a pin sits', () => {
    it('lifts the head off the point it marks, so the geometry stays visible', () => {
        const head = pinHead({ x: 100, y: 100 }, PX);

        expect(head.x).toBe(100);
        expect(head.y).toBeLessThan(100);
    });

    it('scales the lift with the zoom, so the pin is one size on screen', () => {
        const close = pinHead({ x: 0, y: 0 }, 1);
        const far = pinHead({ x: 0, y: 0 }, 4);

        // Four times as many millimetres to a pixel means four times the world offset.
        expect(far.y).toBeCloseTo(close.y * 4);
    });
});

describe('picking a pin', () => {
    it('catches a point on the head rather than on the anchor', () => {
        const one = pin({ at: { x: 0, y: 0 } });

        expect(hitsPin(one, pinHead(one.at, PX), PX)).toBe(true);
        expect(hitsPin(one, { x: 0, y: 0 }, PX)).toBe(false);
    });

    it('answers with the pin drawn last, which is the one that can be seen', () => {
        const under = pin({ id: 'under', at: { x: 0, y: 0 } });
        const over = pin({ id: 'over', at: { x: 0, y: 0 } });

        expect(pinAt([under, over], pinHead(over.at, PX), PX)?.id).toBe('over');
    });

    it('answers with nothing when the point is on empty sheet', () => {
        expect(pinAt([pin()], { x: 5000, y: 5000 }, PX)).toBeNull();
    });
});

describe('numbering', () => {
    /*
     * The number is the thing a person says out loud — "have a look at three" — so it has to
     * mean the same thing tomorrow. Numbering by the list's order would renumber every pin
     * the moment one was resolved.
     */
    it('numbers by when a thread was raised, not by where it sits in the list', () => {
        const older = thread({ id: 'older', createdAt: '2026-09-01T10:00:00+00:00' });
        const newer = thread({ id: 'newer', createdAt: '2026-09-02T10:00:00+00:00' });

        // The list puts the newest first; the numbers must not follow it.
        const pins = commentPins([newer, older]);

        expect(pins.find((one) => one.id === 'older')?.number).toBe(1);
        expect(pins.find((one) => one.id === 'newer')?.number).toBe(2);
    });

    it('keeps a number when the thread before it is resolved', () => {
        const first = thread({ id: 'first', createdAt: '2026-09-01T10:00:00+00:00' });
        const second = thread({ id: 'second', createdAt: '2026-09-02T10:00:00+00:00' });

        const before = commentPins([first, second]);
        const after = commentPins([{ ...first, resolved: true }, second]);

        expect(after.find((one) => one.id === 'second')?.number).toBe(
            before.find((one) => one.id === 'second')?.number,
        );
    });

    it('carries the resolved state through to the pin', () => {
        expect(commentPins([thread({ resolved: true })])[0]?.resolved).toBe(true);
    });
});
