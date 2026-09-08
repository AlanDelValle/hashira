import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';

import { useOrganisationPeople } from './useOrganisationPeople';

// The real `ApiError` is kept, because the hook asks what a failure is with `instanceof` — an
// automocked class would make every refusal look like the same generic one.
vi.mock('@/lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof ApiModule>();

    return {
        ...actual,
        api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };
});

const mocked = vi.mocked(api);

/** One member: the person asking, who is the firm's only admin. */
const ME = {
    id: 'member-1',
    userId: 7,
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    role: 'admin' as const,
};

/** What the server sends back when the last admin tries to go. */
function refused(): ApiError {
    return new ApiError(
        422,
        'The given data was invalid.',
        { member: ['You are the only admin. Make somebody else an admin before you leave.'] },
        null,
    );
}

async function people() {
    const rendered = renderHook(() => useOrganisationPeople('org-1', false));

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    return rendered;
}

describe('acting on who is in a firm', () => {
    beforeEach(() => {
        mocked.get.mockResolvedValue({ data: [ME] });
    });

    it('says so when the server accepted', async () => {
        mocked.delete.mockResolvedValue(undefined);

        const { result } = await people();

        let accepted = false;
        await act(async () => {
            accepted = await result.current.remove(ME.id);
        });

        expect(accepted).toBe(true);
        expect(result.current.refusal).toBeNull();
    });

    /*
     * The half that was missing. Swallowing the rejection keeps it out of the console, and
     * saying which happened is what stops a caller carrying on regardless — the organisation
     * page used to leave for the dashboard either way, so the sentence below was written onto
     * a page the reader was being taken off at the same moment.
     */
    it('says so when the server refused, and keeps what it said', async () => {
        mocked.delete.mockRejectedValue(refused());

        const { result } = await people();

        let accepted = true;
        await act(async () => {
            accepted = await result.current.remove(ME.id);
        });

        expect(accepted).toBe(false);
        expect(result.current.refusal).toBe(
            'You are the only admin. Make somebody else an admin before you leave.',
        );
    });

    // Anything that is not the server refusing in words still has to be reported as a refusal.
    it('falls back to a sentence of its own when the failure carries none', async () => {
        mocked.delete.mockRejectedValue(new Error('the network went away'));

        const { result } = await people();

        let accepted = true;
        await act(async () => {
            accepted = await result.current.remove(ME.id);
        });

        expect(accepted).toBe(false);
        expect(result.current.refusal).toBe('That did not work. Try again.');
    });
});
