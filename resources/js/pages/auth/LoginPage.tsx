import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

interface RedirectState {
    from?: string;
}

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        try {
            await login(email, password, remember);
            const state = location.state as RedirectState | null;
            await navigate(state?.from ?? '/projects', { replace: true });
        } catch (caught) {
            setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not sign in.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout
            title="Sign in"
            description="Open your projects and pick up where you left off."
            footer={
                <>
                    No account yet?{' '}
                    <Link to="/register" className="text-ink rounded-sm font-medium underline">
                        Create one
                    </Link>
                </>
            }
        >
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
                    label="Password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    error={error?.fieldError('password')}
                />

                <div className="flex items-center justify-between">
                    <label className="text-ink-muted flex items-center gap-2 text-[13px]">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(event) => setRemember(event.target.checked)}
                            className="accent-accent size-3.5"
                        />
                        Stay signed in
                    </label>

                    <Link
                        to="/forgot-password"
                        className="text-ink-muted rounded-sm text-[13px] underline"
                    >
                        Forgot password?
                    </Link>
                </div>

                <Button type="submit" variant="primary" busy={busy} className="w-full">
                    {busy ? 'Signing in…' : 'Sign in'}
                </Button>
            </form>
        </AuthLayout>
    );
}
