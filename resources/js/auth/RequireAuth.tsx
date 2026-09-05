import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { stopWatchingMentions, watchMentions } from '@/mentions/mentionsStore';
import { FullPageSpinner } from '@/ui/FullPageSpinner';

/** Gate for every route that needs a signed-in user. */
export function RequireAuth() {
    const { user, loading } = useAuth();
    const location = useLocation();

    /*
     * What this account has been asked about, watched for as long as it is signed in. It sits
     * here rather than on a page because a mention has to survive leaving the drawing it is
     * on — that is the whole point of one.
     */
    useEffect(() => {
        if (user === null) {
            return;
        }

        watchMentions(user.id);

        return () => stopWatchingMentions();
    }, [user]);

    if (loading) {
        return <FullPageSpinner label="Loading your workspace" />;
    }

    if (user === null) {
        // Remember where they were headed so signing in returns them there.
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}
