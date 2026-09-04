import { Check, Copy, UserMinus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { autosave } from '@/editor/persistence/autosave';
import {
    fetchMembers,
    fetchShareLink,
    issueShareLink,
    removeMember,
    revokeShareLink,
} from '@/editor/persistence/sharing';
import { formatRelativeTime } from '@/lib/time';
import type { ProjectMember, ShareLink, ShareRole } from '@/types/api';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

/**
 * Sharing a drawing, and seeing who took the offer up.
 *
 * A link carries a role. `viewer` is the whole of anonymous access — it needs no account and
 * writes nothing down. `editor` cannot be taken up without signing in, and taking it up makes
 * somebody a member of the project: from that moment their access rests on the membership
 * rather than on the link.
 *
 * That is why there are two controls and not one. **Revoking** closes the door, so nobody
 * else can come in and anonymous viewers lose the drawing. **Removing** shows somebody who is
 * already inside back out. Collapsing the two would mean an owner could not re-issue a link
 * without evicting the people they are working with.
 *
 * `commenter` is the third role the API knows, and it is deliberately not offered here yet:
 * there is nothing to comment on until comments exist, and a picker that promises otherwise
 * is a picture of a feature rather than the feature.
 */

const ROLES: { value: ShareRole; title: string; detail: string }[] = [
    {
        value: 'viewer',
        title: 'Can view',
        detail: 'Anyone with the link can look at the drawing, without an account.',
    },
    {
        value: 'editor',
        title: 'Can edit',
        detail: 'Signing in is required, and whoever accepts joins the project.',
    },
];

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
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [role, setRole] = useState<ShareRole>('viewer');
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        void Promise.all([fetchShareLink(projectId), fetchMembers(projectId)])
            .then(([current, joined]) => {
                setLink(current);
                setMembers(joined);
                setRole(current?.role ?? 'viewer');
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

            setLink(await issueShareLink(projectId, role));
            setCopied(false);
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

    async function remove(member: ProjectMember) {
        setBusy(true);
        setError(null);

        try {
            await removeMember(projectId, member.id);
            setMembers((current) => current.filter((one) => one.id !== member.id));
        } catch {
            setError(`Could not remove ${member.name}.`);
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

    const linkRole = ROLES.find((one) => one.value === link?.role);

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Share this drawing"
            description="A link hands out one of two things: looking, or working on it with you."
        >
            <div className="space-y-4">
                {!loaded && <p className="text-ink-subtle text-[13px]">Loading…</p>}

                {loaded && link === null && (
                    <>
                        <fieldset className="space-y-2">
                            <legend className="text-ink-subtle mb-2 text-[11px] tracking-wide uppercase">
                                What the link hands out
                            </legend>

                            {ROLES.map((option) => (
                                <label
                                    key={option.value}
                                    className={
                                        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors ' +
                                        (role === option.value
                                            ? 'border-accent bg-accent-soft'
                                            : 'border-line hover:bg-sunken')
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="share-role"
                                        value={option.value}
                                        checked={role === option.value}
                                        onChange={() => setRole(option.value)}
                                        className="accent-accent mt-0.5"
                                    />
                                    <span>
                                        <span className="text-ink block text-[13px] font-medium">
                                            {option.title}
                                        </span>
                                        <span className="text-ink-muted block text-[13px]">
                                            {option.detail}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </fieldset>

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
                            {linkRole?.title ?? link.role} · created{' '}
                            {formatRelativeTime(link.createdAt)}
                            {link.viewCount > 0
                                ? ` · viewed ${link.viewCount} ${link.viewCount === 1 ? 'time' : 'times'}`
                                : ' · not opened yet'}
                        </p>

                        <div className="border-line flex items-center justify-between gap-4 border-t pt-4">
                            <p className="text-ink-muted text-[13px]">
                                Revoking stops the link working. Anyone who has already joined
                                stays.
                            </p>
                            <Button variant="danger" busy={busy} onClick={() => void revoke()}>
                                Revoke
                            </Button>
                        </div>
                    </>
                )}

                {loaded && members.length > 0 && (
                    <div className="border-line space-y-2 border-t pt-4">
                        <h3 className="text-ink-subtle text-[11px] tracking-wide uppercase">
                            Who has joined
                        </h3>

                        <ul className="space-y-1">
                            {members.map((member) => (
                                <li key={member.id} className="flex items-center gap-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="text-ink block truncate text-[13px]">
                                            {member.name}
                                        </span>
                                        <span className="text-ink-subtle block truncate text-xs">
                                            {member.email} ·{' '}
                                            {member.role === 'editor' ? 'can edit' : 'can comment'}
                                        </span>
                                    </span>

                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        busy={busy}
                                        onClick={() => void remove(member)}
                                        aria-label={`Remove ${member.name}`}
                                    >
                                        <UserMinus className="size-3.5" aria-hidden />
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </div>
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
