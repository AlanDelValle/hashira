import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CommentMention } from '@/types/api';

import { CommentBody } from './CommentBody';

function mention(text: string): CommentMention {
    return { userId: 1, name: text.slice(1), text };
}

describe('a remark with people named in it', () => {
    it('marks the names it was handed and leaves the rest alone', () => {
        render(<CommentBody body="Ask @Ana about the door" mentions={[mention('@Ana')]} />);

        expect(screen.getByText('@Ana')).toBeInTheDocument();
        expect(screen.getByText('@Ana').tagName).toBe('SPAN');
        expect(document.body.textContent).toBe('Ask @Ana about the door');
    });

    /*
     * The client is handed the exact text and highlights it. It must not go looking for what
     * else might be a name — the matching rule lives on the server, and a second copy of it is
     * how the picture and the record end up disagreeing about who was addressed.
     */
    it('leaves an @ nobody was matched to as plain text', () => {
        render(<CommentBody body="The door is at @900mm" mentions={[]} />);

        expect(document.body.textContent).toBe('The door is at @900mm');
        expect(document.querySelector('span')).toBeNull();
    });

    it('prefers the longer name where one contains the other', () => {
        render(
            <CommentBody
                body="@Ana Paula and @Ana"
                mentions={[mention('@Ana'), mention('@Ana Paula')]}
            />,
        );

        expect(screen.getByText('@Ana Paula')).toBeInTheDocument();
        expect(screen.getByText('@Ana')).toBeInTheDocument();
        expect(document.body.textContent).toBe('@Ana Paula and @Ana');
    });

    it('marks every time somebody is named, not only the first', () => {
        render(<CommentBody body="@Ana and again @Ana" mentions={[mention('@Ana')]} />);

        expect(screen.getAllByText('@Ana')).toHaveLength(2);
    });
});
