import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectPerson } from '@/types/api';

import { MentionField } from './MentionField';

const PEOPLE: ProjectPerson[] = [
    { id: 1, name: 'Ana' },
    { id: 2, name: 'Ana Paula' },
    { id: 3, name: 'Bruno' },
];

/** The field is controlled, so a test needs the state its host would hold. */
function Host({ onSubmit, onEscape }: { onSubmit?: () => void; onEscape?: () => void }) {
    const [value, setValue] = useState('');

    return (
        <MentionField
            value={value}
            onChange={setValue}
            people={PEOPLE}
            label="Comment"
            placeholder="Say something"
            onSubmit={onSubmit}
            onEscape={onEscape}
        />
    );
}

describe('naming somebody in a remark', () => {
    it('offers the people whose names carry on from what has been typed', async () => {
        const user = userEvent.setup();

        render(<Host />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('Ask @An');

        expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Ana Paula' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Bruno' })).toBeNull();
    });

    it('writes the whole name in when one is taken with Enter', async () => {
        const user = userEvent.setup();

        render(<Host />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('Ask @An');
        await user.keyboard('{Enter}');

        expect(screen.getByLabelText('Comment')).toHaveValue('Ask @Ana ');
        expect(screen.queryByRole('option')).toBeNull();
    });

    it('moves through the list with the arrows', async () => {
        const user = userEvent.setup();

        render(<Host />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('Ask @An');
        await user.keyboard('{ArrowDown}{Enter}');

        expect(screen.getByLabelText('Comment')).toHaveValue('Ask @Ana Paula ');
    });

    /*
     * Enter has two jobs and the list gets first refusal, so choosing a name cannot post a
     * half-written remark.
     */
    it('does not submit while the list is open', async () => {
        const onSubmit = vi.fn();
        const user = userEvent.setup();

        render(<Host onSubmit={onSubmit} />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('Ask @An{Enter}');

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('dismisses the list on Escape, and keeps what was being written', async () => {
        const onEscape = vi.fn();
        const user = userEvent.setup();

        render(<Host onEscape={onEscape} />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('Ask @An');
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('option')).toBeNull();
        expect(screen.getByLabelText('Comment')).toHaveValue('Ask @An');

        // The first Escape belonged to the list; a second one is meant for the host.
        expect(onEscape).not.toHaveBeenCalled();

        await user.keyboard('{Escape}');
        expect(onEscape).toHaveBeenCalled();
    });

    it('leaves an @ that names nobody alone', async () => {
        const user = userEvent.setup();

        render(<Host />);
        await user.click(screen.getByLabelText('Comment'));
        await user.keyboard('The door is at @900mm');

        expect(screen.queryByRole('option')).toBeNull();
        expect(screen.getByLabelText('Comment')).toHaveValue('The door is at @900mm');
    });
});
