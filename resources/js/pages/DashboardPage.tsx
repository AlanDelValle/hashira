import { MoreHorizontal, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { formatRelativeTime } from '@/lib/time';
import { MentionsMenu } from '@/mentions/MentionsMenu';
import { useInvitations } from '@/projects/useInvitations';
import { useOrganisations } from '@/projects/useOrganisations';
import { useProjects } from '@/projects/useProjects';
import { Button } from '@/ui/Button';
import { Wordmark } from '@/ui/Logo';
import { Menu, MenuItem, MenuSeparator } from '@/ui/Menu';
import { Modal } from '@/ui/Modal';
import { SkipLink } from '@/ui/SkipLink';
import { TextField } from '@/ui/TextField';
import type { ProjectSummary } from '@/types/api';

type Pending =
    | { kind: 'create' }
    | { kind: 'rename'; project: ProjectSummary }
    | { kind: 'organisation' }
    | null;

export function DashboardPage() {
    const { user, logout } = useAuth();
    const { projects, loading, error, reload, create, rename, duplicate, remove, leave } =
        useProjects();
    const { organisations, create: createOrganisation } = useOrganisations();
    const { invitations, answer } = useInvitations();
    const navigate = useNavigate();

    const [pending, setPending] = useState<Pending>(null);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState<ProjectSummary | null>(null);

    /** Empty means the person themselves; otherwise the id of the firm it goes into. */
    const [destination, setDestination] = useState('');

    function openCreate() {
        setName('Untitled plan');
        setDestination('');
        setPending({ kind: 'create' });
    }

    function openNewOrganisation() {
        setName('');
        setPending({ kind: 'organisation' });
    }

    function openRename(project: ProjectSummary) {
        setName(project.name);
        setPending({ kind: 'rename', project });
    }

    async function submitName(event: FormEvent) {
        event.preventDefault();

        if (pending === null || name.trim() === '') return;

        setBusy(true);

        try {
            if (pending.kind === 'organisation') {
                await createOrganisation(name.trim());
            } else if (pending.kind === 'create') {
                const project = await create(name.trim(), destination === '' ? null : destination);
                await navigate(`/projects/${project.id}`);
            } else {
                await rename(pending.project.id, name.trim());
            }

            setPending(null);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="bg-canvas min-h-screen">
            <SkipLink />

            <header className="border-line bg-surface border-b">
                <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
                    <Wordmark />

                    <div className="flex items-center gap-1">
                        <MentionsMenu />

                        <Menu
                            trigger={
                                <button
                                    className="text-ink-muted hover:bg-sunken hover:text-ink rounded-md px-2 py-1 text-[13px]"
                                    aria-label="Account menu"
                                >
                                    {user?.name}
                                </button>
                            }
                        >
                            {organisations.map((organisation) => (
                                <MenuItem
                                    key={organisation.id}
                                    onSelect={() =>
                                        void navigate(`/organisations/${organisation.id}`)
                                    }
                                >
                                    {organisation.name}
                                </MenuItem>
                            ))}
                            {organisations.length > 0 && <MenuSeparator />}
                            <MenuItem onSelect={openNewOrganisation}>New organisation…</MenuItem>
                            <MenuItem onSelect={() => void logout()}>Sign out</MenuItem>
                        </Menu>
                    </div>
                </div>
            </header>

            <main id="content" className="mx-auto max-w-4xl px-6 py-10 sm:py-12">
                {invitations.length > 0 && (
                    <ul className="border-line mb-8 border-t">
                        {invitations.map((invitation) => (
                            <li
                                key={invitation.id}
                                className="border-line flex flex-wrap items-center justify-between gap-3 border-b py-3.5"
                            >
                                <p className="text-ink text-sm">
                                    <span className="font-medium">
                                        {invitation.invitedByName ?? 'Somebody'}
                                    </span>{' '}
                                    invited you to{' '}
                                    <span className="font-medium">
                                        {invitation.organisationName ?? 'an organisation'}
                                    </span>
                                    .
                                </p>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => void answer(invitation, 'accept')}
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => void answer(invitation, 'decline')}
                                    >
                                        Decline
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-baseline justify-between">
                    <h1 className="text-ink text-lg font-semibold tracking-tight">Projects</h1>

                    <Button variant="primary" size="sm" onClick={openCreate}>
                        <Plus className="size-3.5" aria-hidden />
                        New project
                    </Button>
                </div>

                <div className="mt-6">
                    {loading && <ProjectsSkeleton />}

                    {error !== null && (
                        <div className="border-line border-t py-20 text-center">
                            <p role="alert" className="text-ink text-sm">
                                {error}
                            </p>
                            <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-sm">
                                Your projects are safe — this browser could not reach the server.
                            </p>
                            <Button variant="secondary" size="sm" className="mt-5" onClick={reload}>
                                Try again
                            </Button>
                        </div>
                    )}

                    {!loading && error === null && projects.length === 0 && (
                        <div className="border-line border-t py-20 text-center">
                            <p className="text-ink text-sm">Nothing here yet.</p>
                            <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-sm">
                                A project holds one drawing. Create one and you will land straight
                                in the editor.
                            </p>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mt-5"
                                onClick={openCreate}
                            >
                                New project
                            </Button>
                        </div>
                    )}

                    {projects.length > 0 && (
                        <ul className="border-line border-t">
                            {projects.map((project) => (
                                <li
                                    key={project.id}
                                    className="group border-line flex items-center justify-between border-b"
                                >
                                    <Link
                                        /*
                                         * A project you cannot edit opens on the review
                                         * surface. The editor would only redirect here
                                         * anyway; going straight there saves a round trip
                                         * through a page that is not for you.
                                         */
                                        to={
                                            project.role === 'commenter'
                                                ? `/projects/${project.id}/review`
                                                : `/projects/${project.id}`
                                        }
                                        className="flex-1 rounded-sm py-3.5 pr-4"
                                    >
                                        <span className="text-ink text-sm font-medium">
                                            {project.name}
                                        </span>
                                        <span className="text-ink-subtle mt-0.5 block text-xs">
                                            Updated {formatRelativeTime(project.updatedAt)}
                                            {project.role === 'owner' ? (
                                                <>
                                                    {(project.organisationId ?? null) !== null &&
                                                        ` · ${project.ownerName ?? 'A firm'}`}
                                                    {project.isShared === true && ' · Shared'}
                                                </>
                                            ) : (
                                                ` · ${project.ownerName ?? 'Somebody else'}’s, ${
                                                    project.role === 'editor'
                                                        ? 'you can edit'
                                                        : 'you can comment'
                                                }`
                                            )}
                                        </span>
                                    </Link>

                                    <Menu
                                        trigger={
                                            <button
                                                className="text-ink-subtle hover:bg-sunken hover:text-ink rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
                                                aria-label={`Actions for ${project.name}`}
                                            >
                                                <MoreHorizontal className="size-4" aria-hidden />
                                            </button>
                                        }
                                    >
                                        {project.role === 'owner' && (
                                            <MenuItem onSelect={() => openRename(project)}>
                                                Rename
                                            </MenuItem>
                                        )}

                                        {project.role !== 'commenter' && (
                                            <MenuItem onSelect={() => void duplicate(project.id)}>
                                                Duplicate
                                            </MenuItem>
                                        )}

                                        <MenuSeparator />

                                        {project.role === 'owner' ? (
                                            <MenuItem
                                                destructive
                                                onSelect={() => setConfirming(project)}
                                            >
                                                Delete
                                            </MenuItem>
                                        ) : (
                                            /*
                                             * Leaving, not deleting. Removing yourself from
                                             * somebody else's project takes nothing away from
                                             * them, so it does not ask twice.
                                             */
                                            <MenuItem
                                                destructive
                                                onSelect={() =>
                                                    project.membershipId !== undefined &&
                                                    void leave(project.id, project.membershipId)
                                                }
                                            >
                                                Leave
                                            </MenuItem>
                                        )}
                                    </Menu>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </main>

            <Modal
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={
                    pending?.kind === 'organisation'
                        ? 'New organisation'
                        : pending?.kind === 'rename'
                          ? 'Rename project'
                          : 'New project'
                }
            >
                <form onSubmit={(event) => void submitName(event)} className="space-y-5">
                    <TextField
                        label="Name"
                        value={name}
                        autoFocus
                        maxLength={120}
                        onChange={(event) => setName(event.target.value)}
                    />

                    {pending?.kind === 'create' && organisations.length > 0 && (
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor="project-owner" className="text-ink-muted text-[13px]">
                                Belongs to
                            </label>
                            <select
                                id="project-owner"
                                value={destination}
                                onChange={(event) => setDestination(event.target.value)}
                                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-7 rounded-sm border px-1.5 text-[13px] transition-colors"
                            >
                                <option value="">Me</option>
                                {organisations.map((organisation) => (
                                    <option key={organisation.id} value={organisation.id}>
                                        {organisation.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {pending?.kind === 'organisation' && (
                        <p className="text-ink-subtle text-[12px]">
                            Its drawings belong to it rather than to you, and everybody in it can
                            open them. You will be its first admin.
                        </p>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setPending(null)}>Cancel</Button>
                        <Button type="submit" variant="primary" busy={busy}>
                            {pending?.kind === 'rename' ? 'Save' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title="Delete this project?"
                description={
                    confirming === null
                        ? undefined
                        : `“${confirming.name}” and its drawing will be removed. This cannot be undone.`
                }
            >
                <div className="flex justify-end gap-2">
                    <Button onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button
                        variant="danger"
                        onClick={() => {
                            if (confirming !== null) void remove(confirming.id);
                            setConfirming(null);
                        }}
                    >
                        Delete
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

/**
 * The wait for the list.
 *
 * Rows rather than a spinner, because the shape of what is coming is already known and a
 * layout that does not jump when it arrives is worth more than a moving graphic.
 */
function ProjectsSkeleton() {
    return (
        <div role="status" aria-live="polite" className="border-line border-t">
            <span className="sr-only">Loading your projects…</span>

            {[0, 1, 2].map((row) => (
                <div key={row} className="border-line flex flex-col gap-2 border-b py-4">
                    <span className="bg-line block h-3 w-48 rounded-sm" />
                    <span className="bg-line block h-2.5 w-28 rounded-sm opacity-60" />
                </div>
            ))}
        </div>
    );
}
