import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useOrganisationPeople } from '@/projects/useOrganisationPeople';
import { useOrganisations } from '@/projects/useOrganisations';
import type { OrganisationRole } from '@/types/api';
import { Button } from '@/ui/Button';
import { SkipLink } from '@/ui/SkipLink';
import { TextField } from '@/ui/TextField';

const ROLE_LABEL: Record<OrganisationRole, string> = {
    admin: 'Admin',
    member: 'Member',
};

/**
 * Who is in a firm.
 *
 * Deliberately one page rather than a panel on the dashboard: it is a list with consequences —
 * somebody removed here loses every drawing the firm owns — and that deserves a place you went
 * to on purpose rather than a menu you brushed past.
 */
export function OrganisationPage() {
    const { organisationId = '' } = useParams();
    const { user } = useAuth();
    const { organisations, loading: loadingFirms } = useOrganisations();
    const navigate = useNavigate();

    const organisation = organisations.find((each) => each.id === organisationId);
    const canManage = organisation?.role === 'admin';

    const { members, invitations, loading, error, refusal, invite, revoke, setRole, remove } =
        useOrganisationPeople(organisationId, canManage);

    const [email, setEmail] = useState('');
    const [role, setRole_] = useState<OrganisationRole>('member');
    const [busy, setBusy] = useState(false);

    async function submitInvite(event: FormEvent) {
        event.preventDefault();

        if (email.trim() === '') return;

        setBusy(true);

        try {
            await invite(email.trim(), role);
            setEmail('');
        } finally {
            setBusy(false);
        }
    }

    async function leave() {
        const mine = members.find((each) => each.userId === user?.id);

        if (mine === undefined) return;

        /*
         * Only once it has actually happened. Leaving is refused when you are the firm's last
         * admin — a firm with nobody to administer it can never be administered again — and
         * the refusal says what to do instead. Navigating regardless used to write that
         * sentence onto a page the reader was being taken off at the same moment, which left a
         * button that appeared to do nothing at all.
         */
        if (await remove(mine.id)) {
            await navigate('/projects');
        }
    }

    if (!loadingFirms && organisation === undefined) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <p className="text-ink-muted text-sm">
                    This organisation does not exist, or you are not in it.{' '}
                    <Link to="/projects" className="text-ink rounded-sm underline">
                        Back to your projects
                    </Link>
                </p>
            </div>
        );
    }

    return (
        <div className="bg-canvas min-h-screen">
            <SkipLink />

            <main id="content" className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
                <Link
                    to="/projects"
                    className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded-sm text-[13px]"
                >
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Projects
                </Link>

                <h1 className="text-ink mt-4 text-lg font-semibold tracking-tight">
                    {organisation?.name ?? 'Organisation'}
                </h1>
                <p className="text-ink-muted mt-1 text-sm">
                    Everybody here can open and edit the drawings this organisation owns.
                </p>

                {refusal !== null && (
                    <p role="alert" className="text-ink border-line mt-6 border-t pt-4 text-sm">
                        {refusal}
                    </p>
                )}

                {canManage && (
                    <form onSubmit={(event) => void submitInvite(event)} className="mt-8">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-56 flex-1">
                                <TextField
                                    label="Invite by email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                />
                            </div>

                            <select
                                aria-label="Role"
                                value={role}
                                onChange={(event) =>
                                    setRole_(event.target.value as OrganisationRole)
                                }
                                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-9 rounded-sm border px-2 text-[13px] transition-colors"
                            >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                            </select>

                            <Button type="submit" variant="primary" busy={busy}>
                                Invite
                            </Button>
                        </div>
                        <p className="text-ink-subtle mt-2 text-[12px]">
                            They receive an email and join when they accept it. Nothing happens to
                            them until they do.
                        </p>
                    </form>
                )}

                {error !== null && (
                    <p role="alert" className="text-ink border-line mt-8 border-t pt-6 text-sm">
                        {error}
                    </p>
                )}

                {!loading && error === null && (
                    <>
                        <h2 className="text-ink mt-10 text-sm font-semibold">People</h2>

                        <ul className="border-line mt-3 border-t">
                            {members.map((member) => (
                                <li
                                    key={member.id}
                                    className="border-line flex items-center justify-between gap-4 border-b py-3"
                                >
                                    <div className="min-w-0">
                                        <span className="text-ink block truncate text-sm">
                                            {member.name}
                                            {member.userId === user?.id && ' (you)'}
                                        </span>
                                        <span className="text-ink-subtle block truncate text-xs">
                                            {member.email}
                                        </span>
                                    </div>

                                    {canManage ? (
                                        <div className="flex shrink-0 items-center gap-2">
                                            <select
                                                aria-label={`Role for ${member.name}`}
                                                value={member.role}
                                                onChange={(event) =>
                                                    void setRole(
                                                        member.id,
                                                        event.target.value as OrganisationRole,
                                                    )
                                                }
                                                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-7 rounded-sm border px-1.5 text-[13px] transition-colors"
                                            >
                                                <option value="member">Member</option>
                                                <option value="admin">Admin</option>
                                            </select>

                                            <Button
                                                size="sm"
                                                onClick={() => void remove(member.id)}
                                                aria-label={`Remove ${member.name}`}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ) : (
                                        <span className="text-ink-subtle shrink-0 text-xs">
                                            {ROLE_LABEL[member.role]}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {canManage && invitations.length > 0 && (
                            <>
                                <h2 className="text-ink mt-10 text-sm font-semibold">Invited</h2>

                                <ul className="border-line mt-3 border-t">
                                    {invitations.map((invitation) => (
                                        <li
                                            key={invitation.id}
                                            className="border-line flex items-center justify-between gap-4 border-b py-3"
                                        >
                                            <div className="min-w-0">
                                                <span className="text-ink block truncate text-sm">
                                                    {invitation.email}
                                                </span>
                                                <span className="text-ink-subtle block text-xs">
                                                    Invited as {ROLE_LABEL[invitation.role]} ·
                                                    waiting for them to accept
                                                </span>
                                            </div>

                                            <Button
                                                size="sm"
                                                onClick={() => void revoke(invitation.id)}
                                                aria-label={`Withdraw the invitation to ${invitation.email}`}
                                            >
                                                Withdraw
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        <div className="border-line mt-10 border-t pt-6">
                            <Button variant="danger" onClick={() => void leave()}>
                                Leave this organisation
                            </Button>
                            <p className="text-ink-subtle mt-2 text-[12px]">
                                You lose access to its drawings. Its work stays with it.
                            </p>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
