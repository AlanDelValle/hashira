import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { FullPageSpinner } from '@/ui/FullPageSpinner';

/** Signing in again when already signed in is never what someone meant to do. */
export function RedirectIfAuthenticated() {
    const { user, loading } = useAuth();

    if (loading) {
        return <FullPageSpinner label="Checking your session" />;
    }

    return user === null ? <Outlet /> : <Navigate to="/projects" replace />;
}
