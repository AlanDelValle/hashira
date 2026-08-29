import { Link } from 'react-router-dom';

import { Wordmark } from '@/ui/Logo';

export function NotFoundPage() {
    return (
        <div className="bg-canvas flex min-h-screen flex-col">
            <header className="px-6 py-5">
                <Link to="/" className="inline-block rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>
            </header>

            <main className="flex flex-1 items-center justify-center px-6 pb-24">
                <div className="max-w-sm text-center">
                    <p className="text-ink-subtle font-mono text-xs tracking-widest">404</p>
                    <h1 className="text-ink mt-3 text-lg font-semibold tracking-tight">
                        This page does not exist
                    </h1>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        The link may be out of date, or the project may have been deleted.
                    </p>
                    <Link
                        to="/"
                        className="text-ink mt-6 inline-block rounded-sm text-sm font-medium underline"
                    >
                        Back to the start
                    </Link>
                </div>
            </main>
        </div>
    );
}
