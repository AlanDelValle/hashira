import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, type Envelope } from '@/lib/api';
import type { Organisation, OrganisationInvitation } from '@/types/api';
import { Button } from '@/ui/Button';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Wordmark } from '@/ui/Logo';

type State =
    | { kind: 'loading' }
    | { kind: 'offer'; invitation: OrganisationInvitation }
    | { kind: 'gone' }
    | { kind: 'joined'; organisation: Organisation };

/**
 * Where the link in an invitation email lands.
 *
 * **It never accepts on its own.** The page is a GET and mail clients prefetch links; joining a
 * firm on arrival would mean a scanner somewhere accepting on somebody's behalf. So this shows
 * what is being offered and waits for a click, and the accepting itself is a POST.
 *
 * Signing in happens before this: the route is behind `RequireAuth`, which remembers where
 * somebody was headed — and since being invited by email usually means having no account yet,
 * registering carries that destination too.
 */
export function InvitationPage() {
    const { token = '' } = useParams();
    const navigate = useNavigate();

    const [state, setState] = useState<State>({ kind: 'loading' });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;

        /*
         * Reading it is authorized exactly as accepting it is — open, and written to the
         * address this account signs in with — so a stranger holding a token learns nothing
         * here that the accept route would not already refuse them.
         */
        void api
            .get<Envelope<OrganisationInvitation>>(`/api/invitations/${token}`)
            .then((response) => {
                if (!cancelled) setState({ kind: 'offer', invitation: response.data });
            })
            .catch(() => {
                if (!cancelled) setState({ kind: 'gone' });
            });

        return () => {
            cancelled = true;
        };
    }, [token]);

    async function respond(answer: 'accept' | 'decline') {
        setBusy(true);

        try {
            if (answer === 'decline') {
                await api.post(`/api/invitations/${token}/decline`);
                await navigate('/projects', { replace: true });

                return;
            }

            const response = await api.post<Envelope<Organisation>>(
                `/api/invitations/${token}/accept`,
            );

            setState({ kind: 'joined', organisation: response.data });
        } catch {
            setState({ kind: 'gone' });
        } finally {
            setBusy(false);
        }
    }

    if (state.kind === 'loading') {
        return <FullPageSpinner label="Opening your invitation" />;
    }

    return (
        <div className="bg-canvas flex min-h-screen flex-col">
            <header className="px-6 py-5">
                <Link to="/projects" className="inline-block rounded-sm" aria-label="Hashira home">
                    <Wordmark />
                </Link>
            </header>

            <main className="flex flex-1 items-start justify-center px-6 pb-16">
                <div className="w-full max-w-md pt-10">
                    {state.kind === 'gone' && (
                        <>
                            <h1 className="text-ink text-lg font-semibold tracking-tight">
                                This invitation is not open
                            </h1>
                            <p className="text-ink-muted mt-2 text-sm">
                                It may have been withdrawn, already accepted, or written to a
                                different address than the one you are signed in with. Ask whoever
                                invited you to send another.
                            </p>
                            <Link
                                to="/projects"
                                className="text-ink mt-6 inline-block rounded-sm text-sm underline"
                            >
                                Go to your projects
                            </Link>
                        </>
                    )}

                    {state.kind === 'offer' && (
                        <>
                            <h1 className="text-ink text-lg font-semibold tracking-tight">
                                Join {state.invitation.organisationName ?? 'this organisation'}
                            </h1>
                            <p className="text-ink-muted mt-2 text-sm">
                                {state.invitation.invitedByName ?? 'Somebody'} invited you as{' '}
                                {state.invitation.role === 'admin' ? 'an admin' : 'a member'}. You
                                will be able to open and edit the drawings it owns
                                {state.invitation.role === 'admin' &&
                                    ', and decide who else is in it'}
                                .
                            </p>

                            <div className="mt-7 flex gap-2">
                                <Button
                                    variant="primary"
                                    busy={busy}
                                    onClick={() => void respond('accept')}
                                >
                                    Accept
                                </Button>
                                <Button onClick={() => void respond('decline')}>Decline</Button>
                            </div>
                        </>
                    )}

                    {state.kind === 'joined' && (
                        <>
                            <h1 className="text-ink text-lg font-semibold tracking-tight">
                                You are in {state.organisation.name}
                            </h1>
                            <p className="text-ink-muted mt-2 text-sm">
                                Its drawings are on your projects list now.
                            </p>
                            <Link
                                to="/projects"
                                className="text-ink mt-6 inline-block rounded-sm text-sm underline"
                            >
                                Open your projects
                            </Link>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
