import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { RedirectIfAuthenticated } from '@/auth/RedirectIfAuthenticated';
import { RequireAuth } from '@/auth/RequireAuth';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { FullPageSpinner } from '@/ui/FullPageSpinner';

/**
 * Routing, and where the application is cut in two.
 *
 * The landing page and the sign-in screens are what an unknown visitor loads first, and they
 * have no business paying for a drawing editor they may never open. Everything that reaches
 * into `editor/` — the canvas, the tools, the snapping engine, the exporters — is behind a
 * dynamic import, so the first load carries the pages someone actually asked for.
 *
 * Named exports are the convention throughout, so each one is adapted rather than the export
 * style being bent to suit the bundler.
 */
function route<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
    return lazy(async () => ({ default: (await load())[name] }));
}

const EditorPage = route(() => import('@/pages/EditorPage'), 'EditorPage');
const SharedPlanPage = route(() => import('@/pages/SharedPlanPage'), 'SharedPlanPage');
const DashboardPage = route(() => import('@/pages/DashboardPage'), 'DashboardPage');

export function Application() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Suspense fallback={<FullPageSpinner label="Loading" />}>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/share/:token" element={<SharedPlanPage />} />

                        <Route element={<RedirectIfAuthenticated />}>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                        </Route>

                        <Route element={<RequireAuth />}>
                            <Route path="/projects" element={<DashboardPage />} />
                            <Route path="/projects/:projectId" element={<EditorPage />} />
                        </Route>

                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Suspense>
            </AuthProvider>
        </BrowserRouter>
    );
}
