import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { FullPageSpinner } from '@/ui/FullPageSpinner';

interface RedirectState {
    from?: string;
}

/**
 * Signing in again when already signed in is never what someone meant to do.
 *
 * It sends them where they were going, not merely somewhere. The session appearing re-renders
 * this guard at the same moment the sign-in page runs its own `navigate`, so the two race — and
 * when this one sent everybody to the dashboard unconditionally, it sometimes won and threw
 * away the destination `RequireAuth` had carefully remembered. Agreeing on the answer is what
 * removes the race, rather than trying to win it.
 *
 * Found by walking an invitation: somebody with no account, sent from an email to a page behind
 * the gate, registered and landed on the dashboard instead of the invitation they had been
 * asked to answer.
 */
export function RedirectIfAuthenticated() {
    const { user, loading } = useAuth();
    const state = useLocation().state as RedirectState | null;

    if (loading) {
        return <FullPageSpinner label="Checking your session" />;
    }

    return user === null ? <Outlet /> : <Navigate to={state?.from ?? '/projects'} replace />;
}
