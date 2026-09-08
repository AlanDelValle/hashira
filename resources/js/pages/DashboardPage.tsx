import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/time';
import { MentionsMenu } from '@/mentions/MentionsMenu';
import { describeAccess, describeDrawing } from '@/projects/card';
import {
    arrangeProjects,
    CONTROLS_FROM,
    isArchived,
    ORDER_LABEL,
    orderProjects,
    partitionArchived,
    type ProjectOrder,
} from '@/projects/list';
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
    const { projects, loading, error, reload, create, rename, duplicate, remove, leave, archive } =
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

    const [query, setQuery] = useState('');
    const [order, setOrder] = useState<ProjectOrder>('updated');
    const [openedArchive, setOpenedArchive] = useState(false);

    const { live, archived } = useMemo(() => partitionArchived(projects), [projects]);
    const groups = useMemo(() => arrangeProjects(live, { query, order }), [live, query, order]);
    const shelf = useMemo(
        () => orderProjects(archived, { query, order }),
        [archived, query, order],
    );

    const filtering = query.trim() !== '';
    const shown = groups.reduce((total, group) => total + group.projects.length, 0);

    /*
     * Nothing above the shelf, and why. A filter that matched only archived drawings is not one
     * of these: the shelf below is open and holding them, so saying "nothing here" over the top
     * of an answer would be the page contradicting itself.
     */
    const emptyBecause: 'filter' | 'archive' | null =
        projects.length === 0 || shown > 0
            ? null
            : filtering
              ? shelf.length === 0
                  ? 'filter'
                  : null
              : 'archive';

    /*
     * Looking for something means looking everywhere. Half an answer behind a disclosure is
     * how a filter comes to report that a drawing is not here when it is.
     */
    const archiveOpen = openedArchive || filtering;

    const actions = {
        rename: openRename,
        duplicate: (project: ProjectSummary) => void duplicate(project.id),
        archive: (project: ProjectSummary) => void archive(project.id, !isArchived(project)),
        remove: setConfirming,
        leave: (project: ProjectSummary) =>
            project.membershipId !== undefined && void leave(project.id, project.membershipId),
    };

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

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-ink text-lg font-semibold tracking-tight">Projects</h1>

                    <div className="flex items-center gap-2">
                        {/*
                         * Only once there is enough here to lose something in. See CONTROLS_FROM:
                         * a filter over three rows has never been faster than reading them.
                         */}
                        {projects.length >= CONTROLS_FROM && (
                            <>
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    aria-label="Filter projects by name"
                                    placeholder="Filter"
                                    className="border-line-strong bg-surface text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus:border-accent h-8 w-28 rounded-sm border px-2 text-[13px] transition-colors sm:w-40"
                                />

                                <select
                                    aria-label="Order projects by"
                                    value={order}
                                    onChange={(event) =>
                                        setOrder(event.target.value as ProjectOrder)
                                    }
                                    className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-8 rounded-sm border px-1.5 text-[13px] transition-colors"
                                >
                                    {Object.entries(ORDER_LABEL).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}

                        <Button variant="primary" size="sm" onClick={openCreate}>
                            <Plus className="size-3.5" aria-hidden />
                            New project
                        </Button>
                    </div>
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

                    {!loading && error === null && emptyBecause !== null && (
                        <div className="border-line border-t py-20 text-center">
                            {emptyBecause === 'filter' ? (
                                <>
                                    <p className="text-ink text-sm">
                                        Nothing here is called “{query.trim()}”.
                                    </p>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="mt-5"
                                        onClick={() => setQuery('')}
                                    >
                                        Clear the filter
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <p className="text-ink text-sm">
                                        Everything here has been put away.
                                    </p>
                                    <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-sm">
                                        Your archived projects are below, and any of them can be
                                        taken back out.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {groups.map((group, index) => (
                        <section key={group.id}>
                            {/*
                             * One section is not a section. Somebody working alone on their own
                             * drawings sees the list they have always seen, which is the whole
                             * reason a project can still belong to a person rather than a firm.
                             */}
                            {groups.length > 1 && (
                                <h2
                                    className={cn(
                                        'text-ink-subtle border-line border-b pb-2 font-mono text-[11px] tracking-[0.08em] uppercase',
                                        index > 0 && 'mt-9',
                                    )}
                                >
                                    {group.name} · {group.projects.length}
                                </h2>
                            )}

                            <ul className={cn(groups.length === 1 && 'border-line border-t')}>
                                {group.projects.map((project) => (
                                    <ProjectRow
                                        key={project.id}
                                        project={project}
                                        actions={actions}
                                        ownerNamed={groups.length > 1 && group.namesOwner}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}

                    {/*
                     * The shelf. `projects.archived_at` has been in the schema since Phase 1
                     * with nothing writing it; what it was always for is this — a drafting
                     * office finishes jobs, and last year's should not sit between two live
                     * ones. Nothing is hidden: an archived drawing opens, exports and keeps
                     * its links, and the row here is the same row as above.
                     */}
                    {!loading && error === null && shelf.length > 0 && (
                        <div className={cn(shown > 0 ? 'mt-9' : 'mt-6')}>
                            <button
                                type="button"
                                aria-expanded={archiveOpen}
                                onClick={() => setOpenedArchive(!archiveOpen)}
                                className="text-ink-subtle hover:text-ink border-line flex w-full items-center gap-1.5 rounded-sm border-b pb-2 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors"
                            >
                                <ChevronRight
                                    className={cn(
                                        'size-3 transition-transform',
                                        archiveOpen && 'rotate-90',
                                    )}
                                    aria-hidden
                                />
                                Archived · {shelf.length}
                            </button>

                            {archiveOpen && (
                                <ul>
                                    {shelf.map((project) => (
                                        <ProjectRow
                                            key={project.id}
                                            project={project}
                                            actions={actions}
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
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
 * The drawing, the size of a postage stamp.
 *
 * Drawn by the editor from the same scene every export comes out of, so what a card shows is
 * the plan rather than an illustration of one — rule 10 of AGENTS.md, applied to a screen. The
 * image is its own request rather than part of the list's payload: forty of these are forty
 * things the browser already knows how to lazy load and revalidate into 304s.
 *
 * Without a picture the frame is still drawn, so the column of names stays a column — but which
 * frame depends on why there is none, because the two reasons are not the same statement. A
 * drawing with nothing on it gets paper, since a blank sheet is exactly what it has. One that
 * has been drawn on but not yet photographed gets a plain tile: the picture is written a few
 * seconds after somebody opens the plan, so an existing drawing has none until it is next
 * looked at, and showing fourteen elements as an empty sheet would be the card saying something
 * false about the drawing behind it.
 *
 * `alt` is empty on purpose. The name is the next thing on the row, and "a thumbnail of
 * Bedroom" read out before the word "Bedroom" is noise rather than a description.
 */
function ProjectThumbnail({ project }: { project: ProjectSummary }) {
    const frame = 'border-line h-11 w-16 shrink-0 rounded-sm border';

    if (project.drawing?.preview !== true) {
        const empty = project.drawing?.elements === 0;

        return <span aria-hidden className={cn(frame, empty ? 'bg-surface' : 'bg-sunken')} />;
    }

    return (
        <img
            src={`/api/projects/${project.id}/preview`}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(frame, 'bg-surface object-contain')}
        />
    );
}

interface RowActions {
    rename: (project: ProjectSummary) => void;
    duplicate: (project: ProjectSummary) => void;
    archive: (project: ProjectSummary) => void;
    remove: (project: ProjectSummary) => void;
    leave: (project: ProjectSummary) => void;
}

/**
 * One project, wherever it is listed.
 *
 * The archived shelf shows the same row as the live list rather than a quieter version of it:
 * a drawing that has been put away is not a lesser drawing, and dimming it would say it was.
 * What differs is one word in the menu.
 */
function ProjectRow({
    project,
    actions,
    ownerNamed = false,
}: {
    project: ProjectSummary;
    actions: RowActions;
    /** Whether the heading above this row is already the name of whoever owns it. */
    ownerNamed?: boolean;
}) {
    const archived = isArchived(project);

    return (
        <li className="group border-line flex items-center justify-between gap-1 border-b">
            <Link
                /*
                 * A project you cannot edit opens on the review surface. The editor would only
                 * redirect here anyway; going straight there saves a round trip through a page
                 * that is not for you.
                 */
                to={
                    project.role === 'commenter'
                        ? `/projects/${project.id}/review`
                        : `/projects/${project.id}`
                }
                className="flex min-w-0 flex-1 items-center gap-3.5 rounded-sm py-3 pr-4"
            >
                <ProjectThumbnail project={project} />

                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-4">
                        <span className="text-ink truncate text-sm font-medium">
                            {project.name}
                        </span>
                        <span className="text-ink-subtle shrink-0 text-xs">
                            {archived
                                ? `Archived ${formatRelativeTime(project.archivedAt ?? project.updatedAt)}`
                                : `Updated ${formatRelativeTime(project.updatedAt)}`}
                        </span>
                    </span>

                    <ProjectMeta project={project} ownerNamed={ownerNamed} />
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
                    <MenuItem onSelect={() => actions.rename(project)}>Rename</MenuItem>
                )}

                {project.role !== 'commenter' && (
                    <MenuItem onSelect={() => actions.duplicate(project)}>Duplicate</MenuItem>
                )}

                {project.role === 'owner' && (
                    <MenuItem onSelect={() => actions.archive(project)}>
                        {archived ? 'Take out of the archive' : 'Archive'}
                    </MenuItem>
                )}

                <MenuSeparator />

                {project.role === 'owner' ? (
                    <MenuItem destructive onSelect={() => actions.remove(project)}>
                        Delete
                    </MenuItem>
                ) : (
                    /*
                     * Leaving, not deleting. Removing yourself from somebody else's project
                     * takes nothing away from them, so it does not ask twice.
                     */
                    <MenuItem destructive onSelect={() => actions.leave(project)}>
                        Leave
                    </MenuItem>
                )}
            </Menu>
        </li>
    );
}

/**
 * The line under a project's name.
 *
 * Two halves in two faces: what the drawing is, in the monospaced figures every measurement in
 * this product is set in, and who can reach it, in words. Either half can be missing — a
 * project whose drawing has never been saved has nothing to count, and your own unshared
 * drawing has nothing to say about access — and when both are, the line is not drawn at all
 * rather than left as an empty row of whitespace.
 *
 * It wraps rather than truncating. A name is cut off because the date beside it matters more
 * and the name is on the row above anyway; there is nothing above this line, and an ellipsis
 * here would hide a fact — that the drawing is restricted, say — with no way to ask for it.
 */
function ProjectMeta({ project, ownerNamed }: { project: ProjectSummary; ownerNamed: boolean }) {
    const drawing = describeDrawing(project.drawing);
    const access = describeAccess(project, { ownerNamed });

    if (drawing === null && access.length === 0) return null;

    return (
        <span className="text-ink-subtle mt-1 block text-[11px]">
            {drawing !== null && <span className="font-mono">{drawing}</span>}
            {drawing !== null && access.length > 0 && ' · '}
            {access.join(' · ')}
        </span>
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
                <div key={row} className="border-line flex flex-col gap-2 border-b py-3.5">
                    <span className="bg-line block h-3 w-48 rounded-sm" />
                    <span className="bg-line block h-2.5 w-64 rounded-sm opacity-60" />
                </div>
            ))}
        </div>
    );
}
