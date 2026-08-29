import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, ApiError, type Envelope } from '@/lib/api';
import type { AuthenticatedUser } from '@/types/api';

export interface AuthState {
    user: AuthenticatedUser | null;
    /** True until the first `GET /api/user` settles, so guards do not flash the login page. */
    loading: boolean;
    // Declared as properties rather than methods: they are always destructured off the
    // context, never called on it, so they carry no `this` to lose.
    login: (email: string, password: string, remember: boolean) => Promise<void>;
    register: (
        name: string,
        email: string,
        password: string,
        confirmation: string,
    ) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthenticatedUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<AuthenticatedUser>>('/api/user')
            .then((response) => {
                if (!cancelled) setUser(response.data);
            })
            .catch((error: unknown) => {
                // A 401 here is the normal signed-out case, not a failure worth reporting.
                if (!(error instanceof ApiError) || !error.isUnauthenticated) {
                    console.error(error);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (email: string, password: string, remember: boolean) => {
        const response = await api.post<Envelope<AuthenticatedUser>>('/api/login', {
            email,
            password,
            remember,
        });

        setUser(response.data);
    }, []);

    const register = useCallback(
        async (name: string, email: string, password: string, confirmation: string) => {
            const response = await api.post<Envelope<AuthenticatedUser>>('/api/register', {
                name,
                email,
                password,
                password_confirmation: confirmation,
            });

            setUser(response.data);
        },
        [],
    );

    const logout = useCallback(async () => {
        await api.post('/api/logout');
        setUser(null);
    }, []);

    const value = useMemo<AuthState>(
        () => ({ user, loading, login, register, logout }),
        [user, loading, login, register, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
