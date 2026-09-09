import { api } from '@/lib/api';

/**
 * Changing the password of the account you are signed in with.
 *
 * Not on the auth context, because unlike renaming yourself or closing the account it changes
 * nothing the application is holding: you carry on as the same person on the same session, and
 * the only thing that moved is a secret nobody here ever had.
 *
 * The current one is asked for and sent. That is not ceremony — the session proves somebody
 * walked up to an unlocked screen, and taking an account from its owner should cost more.
 */
export async function changePassword(
    currentPassword: string,
    password: string,
    confirmation: string,
): Promise<void> {
    await api.put('/api/user/password', {
        currentPassword,
        password,
        password_confirmation: confirmation,
    });
}
