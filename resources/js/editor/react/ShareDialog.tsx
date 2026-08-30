import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { fetchShareLink, issueShareLink, revokeShareLink } from '@/editor/persistence/sharing';
import { autosave } from '@/editor/persistence/autosave';
import { formatRelativeTime } from '@/lib/time';
import type { ShareLink } from '@/types/api';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

/**
 * Sharing a drawing as a read-only link.
 *
 * The link shows the drawing and nothing else — no account, no editing, and no way back to the
 * project it belongs to. Revoking is immediate, and the same URL never comes back: a new link
 * is a new token.
 */
export function ShareDialog({
    projectId,
    open,
    onOpenChange,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [link, setLink] = useState<ShareLink | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        void fetchShareLink(projectId)
            .then((current) => {
                setLink(current);
                setLoaded(true);
                setError(null);
            })
            .catch(() => {
                setLoaded(true);
                setError('Could not check whether this drawing is shared.');
            });
    }, [projectId]);

    useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open, refresh]);

    async function create() {
        setBusy(true);
        setError(null);

        try {
            // Whoever opens the link should see the drawing as it is now, not as it was at the
            // last autosave.
            autosave.flush();

            setLink(await issueShareLink(projectId));
        } catch {
            setError('Could not create a link.');
        } finally {
            setBusy(false);
        }
    }

    async function revoke() {
        setBusy(true);
        setError(null);

        try {
            await revokeShareLink(projectId);
            setLink(null);
            setCopied(false);
        } catch {
            setError('Could not revoke the link.');
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (link === null) return;

        try {
            await navigator.clipboard.writeText(link.url);
            setCopied(true);
        } catch {
            setError('Could not copy — select the address and copy it by hand.');
        }
    }

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Share this drawing"
            description="Anyone with the link can view the drawing. Nobody can change it."
        >
            <div className="space-y-4">
                {!loaded && <p className="text-ink-subtle text-[13px]">Loading…</p>}

                {loaded && link === null && (
                    <>
                        <p className="text-ink-muted text-[13px]">
                            This drawing is private. A link makes it viewable by anyone who has it,
                            without an account.
                        </p>
                        <Button variant="primary" busy={busy} onClick={() => void create()}>
                            Create a link
                        </Button>
                    </>
                )}

                {loaded && link !== null && (
                    <>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={link.url}
                                onFocus={(event) => event.currentTarget.select()}
                                className="border-line-strong bg-sunken text-ink h-9 flex-1 rounded-md border px-2 font-mono text-[12px]"
                            />
                            <Button onClick={() => void copy()} aria-label="Copy link">
                                {copied ? (
                                    <Check className="size-3.5" aria-hidden />
                                ) : (
                                    <Copy className="size-3.5" aria-hidden />
                                )}
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </div>

                        <p className="text-ink-subtle text-xs">
                            Created {formatRelativeTime(link.createdAt)}
                            {link.viewCount > 0
                                ? ` · viewed ${link.viewCount} ${link.viewCount === 1 ? 'time' : 'times'}`
                                : ' · not opened yet'}
                        </p>

                        <div className="border-line flex items-center justify-between border-t pt-4">
                            <p className="text-ink-muted text-[13px]">
                                Revoking stops the link working immediately.
                            </p>
                            <Button variant="danger" busy={busy} onClick={() => void revoke()}>
                                Revoke
                            </Button>
                        </div>
                    </>
                )}

                {error !== null && (
                    <p role="alert" className="text-danger text-[13px]">
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    );
}
