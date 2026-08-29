import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { FullPageSpinner } from '@/ui/FullPageSpinner';

/** Gate for every route that needs a signed-in user. */
export function RequireAuth() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <FullPageSpinner label="Loading your workspace" />;
    }

    if (user === null) {
        // Remember where they were headed so signing in returns them there.
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}
