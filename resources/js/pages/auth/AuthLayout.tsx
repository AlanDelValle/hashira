import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Wordmark } from '@/ui/Logo';

interface AuthLayoutProps {
    title: string;
    description: string;
    children: ReactNode;
    footer?: ReactNode;
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
    return (
        <div className="bg-canvas flex min-h-screen flex-col">
            <header className="px-6 py-5">
                <Link to="/" className="inline-block rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>
            </header>

            <main className="flex flex-1 items-start justify-center px-6 pt-8 pb-24 sm:pt-16">
                <div className="w-full max-w-90">
                    <h1 className="text-ink text-xl font-semibold tracking-tight">{title}</h1>
                    <p className="text-ink-muted mt-1.5 text-sm">{description}</p>

                    <div className="mt-7">{children}</div>

                    {footer !== undefined && (
                        <div className="border-line text-ink-muted mt-6 border-t pt-5 text-sm">
                            {footer}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
