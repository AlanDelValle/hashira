import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState('');
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
            await register(name, email, password, confirmation);
            await navigate('/projects', { replace: true });
        } catch (caught) {
            setError(
                caught instanceof ApiError ? caught : new ApiError(0, 'Could not create account.'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout
            title="Create an account"
            description="Free, and your drawings stay yours."
            footer={
                <>
                    Already have an account?{' '}
                    <Link to="/login" className="text-ink rounded-sm font-medium underline">
                        Sign in
                    </Link>
                </>
            }
        >
            <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
                <TextField
                    label="Name"
                    name="name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    error={error?.fieldError('name')}
                />

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
                    label="Password"
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
                    label="Confirm password"
                    type="password"
                    name="password_confirmation"
                    autoComplete="new-password"
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                />

                <Button type="submit" variant="primary" busy={busy} className="w-full">
                    {busy ? 'Creating account…' : 'Create account'}
                </Button>
            </form>
        </AuthLayout>
    );
}
