import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api, ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

/**
 * The reset link carries only the token. The email address is asked for here rather than
 * passed in the URL, so it never reaches browser history, referrer headers or access logs.
 */
export function ResetPasswordPage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState<ApiError | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        try {
            await api.post('/api/reset-password', {
                token,
                email,
                password,
                password_confirmation: confirmation,
            });

            await navigate('/login', { replace: true });
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught
                    : new ApiError(0, 'Could not reset the password.'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Choose a new password" description="Confirm your email to continue.">
            <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
                <TextField
                    label="Email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    error={error?.fieldError('email')}
                />

                <TextField
                    label="New password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    hint="At least 8 characters."
                    error={error?.fieldError('password')}
                />

                <TextField
                    label="Confirm new password"
                    type="password"
                    name="password_confirmation"
                    autoComplete="new-password"
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                />

                <Button type="submit" variant="primary" busy={busy} className="w-full">
                    {busy ? 'Saving…' : 'Save new password'}
                </Button>
            </form>
        </AuthLayout>
    );
}
