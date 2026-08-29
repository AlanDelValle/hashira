import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { RedirectIfAuthenticated } from '@/auth/RedirectIfAuthenticated';
import { RequireAuth } from '@/auth/RequireAuth';
import { DashboardPage } from '@/pages/DashboardPage';
import { EditorPage } from '@/pages/EditorPage';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SharedPlanPage } from '@/pages/SharedPlanPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

export function Application() {
    return (
        <BrowserRouter>
            <AuthProvider>
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
            </AuthProvider>
        </BrowserRouter>
    );
}
