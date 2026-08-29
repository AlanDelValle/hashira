import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { parseDocument } from '@/editor/model/document';
import { api, type Envelope } from '@/lib/api';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Wordmark } from '@/ui/Logo';
import type { SharedDocumentPayload } from '@/types/api';

/**
 * What a link recipient sees. No account, no editing, and no way from here to the project it
 * belongs to — the endpoint behind this page returns the drawing and nothing else.
 */
export function SharedPlanPage() {
    const { token } = useParams<{ token: string }>();
    const [document, setDocument] = useState<SharedDocumentPayload | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<SharedDocumentPayload>>(`/api/share/${token ?? ''}`)
            .then((response) => {
                if (!cancelled) setDocument(response.data);
            })
            .catch(() => {
                /* An unknown, revoked or expired link all land in the same empty state. */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [token]);

    if (loading) {
        return <FullPageSpinner label="Opening shared drawing" />;
    }

    if (document === null) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <h1 className="text-ink text-sm font-medium">This link is no longer active</h1>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        It may have been revoked by its owner, or it may have expired.
                    </p>
                </div>
            </div>
        );
    }

    // The same parser the editor uses, rather than a second, looser reader of the format.
    const parsed = parseDocument(document.drawing);

    return (
        <div className="bg-canvas flex min-h-screen flex-col">
            <header className="border-line bg-surface flex h-12 items-center justify-between border-b px-4">
                <div className="flex items-center gap-3">
                    <Link to="/" className="rounded-sm" aria-label="Hashira home">
                        <Wordmark />
                    </Link>
                    <span className="bg-line h-4 w-px" aria-hidden />
                    <h1 className="text-ink text-[13px] font-medium">{document.name}</h1>
                </div>

                <span className="text-ink-subtle font-mono text-[11px]">read only</span>
            </header>

            <main className="flex flex-1 items-center justify-center px-6">
                <p className="text-ink-subtle max-w-xs text-center text-[13px]">
                    {parsed.ok
                        ? `The read-only drawing view arrives with the renderer. This drawing has ${parsed.document.elements.length} ${parsed.document.elements.length === 1 ? 'element' : 'elements'} at 1:${parsed.document.settings.scale}.`
                        : parsed.reason}
                </p>
            </main>
        </div>
    );
}
