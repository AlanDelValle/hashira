import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api, ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        try {
            await api.post('/api/forgot-password', { email });
            setSent(true);
        } catch (caught) {
            setError(
                caught instanceof ApiError ? caught : new ApiError(0, 'Could not send the email.'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout
            title="Reset your password"
            description="We will email you a link to choose a new one."
            footer={
                <Link to="/login" className="text-ink rounded-sm font-medium underline">
                    Back to sign in
                </Link>
            }
        >
            {sent ? (
                <p role="status" className="text-ink-muted text-sm">
                    If an account exists for <span className="text-ink">{email}</span>, a reset link
                    is on its way. The link expires in one hour.
                </p>
            ) : (
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

                    <Button type="submit" variant="primary" busy={busy} className="w-full">
                        {busy ? 'Sending…' : 'Send reset link'}
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
