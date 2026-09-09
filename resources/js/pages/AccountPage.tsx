import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { changePassword } from '@/auth/account';
import { useAuth } from '@/auth/useAuth';
import { ApiError } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { SkipLink } from '@/ui/SkipLink';
import { TextField } from '@/ui/TextField';

/**
 * Your own account: the name other people see, the password, and the end of it.
 *
 * One page rather than three, and a page rather than a dialog, for the reason the organisation
 * page is one: the last thing on it removes every drawing you own, and that deserves somewhere
 * you went to on purpose instead of a menu you brushed past.
 *
 * The address is deliberately not editable. An email is what an invitation is written to and
 * where a password reset arrives, so changing one is a flow with a message in it — not a field
 * that quietly stops the last invitation anybody sent you from working.
 */
export function AccountPage() {
    const { user, rename, closeAccount } = useAuth();

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

                <h1 className="text-ink mt-4 text-lg font-semibold tracking-tight">Your account</h1>
                <p className="text-ink-muted mt-1 text-sm">
                    Signed in as <span className="text-ink">{user?.email}</span>.
                </p>

                <NameSection name={user?.name ?? ''} rename={rename} />
                <PasswordSection />
                <CloseSection closeAccount={closeAccount} />
            </main>
        </div>
    );
}

/**
 * What the server refused, in its own words.
 *
 * The same shape `useOrganisationPeople` uses: validation carries the sentence, and everything
 * else falls back to one of ours. A rule enforced by a message nobody reads is a button that
 * appears to do nothing.
 */
function refusalFrom(caught: unknown, field: string): string {
    if (!(caught instanceof ApiError)) {
        return 'That did not work. Try again.';
    }

    return caught.errors[field]?.[0] ?? Object.values(caught.errors)[0]?.[0] ?? caught.message;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-line mt-10 border-t pt-6">
            <h2 className="text-ink text-sm font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function NameSection({ name, rename }: { name: string; rename: (name: string) => Promise<void> }) {
    const [draft, setDraft] = useState(name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [saved, setSaved] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();

        setBusy(true);
        setError(undefined);
        setSaved(false);

        try {
            await rename(draft.trim());
            setSaved(true);
        } catch (caught) {
            setError(refusalFrom(caught, 'name'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Section title="Your name">
            <p className="text-ink-muted mt-1 text-sm">
                What everybody else sees: on a drawing that is yours, beside a remark, on your
                cursor while somebody watches you draw.
            </p>

            <form onSubmit={(event) => void submit(event)} className="mt-4 max-w-sm space-y-4">
                <TextField
                    label="Name"
                    value={draft}
                    maxLength={120}
                    error={error}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        setSaved(false);
                    }}
                />

                <div className="flex items-center gap-3">
                    <Button
                        type="submit"
                        variant="primary"
                        busy={busy}
                        disabled={draft.trim() === '' || draft.trim() === name}
                    >
                        Save
                    </Button>

                    {saved && (
                        <span role="status" className="text-ink-subtle text-[13px]">
                            Saved.
                        </span>
                    )}
                </div>
            </form>
        </Section>
    );
}

function PasswordSection() {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [changed, setChanged] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();

        setBusy(true);
        setError(undefined);
        setChanged(false);

        try {
            await changePassword(current, next, confirmation);

            // Nothing typed here is worth keeping once it has been accepted.
            setCurrent('');
            setNext('');
            setConfirmation('');
            setChanged(true);
        } catch (caught) {
            setError(refusalFrom(caught, 'currentPassword'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Section title="Your password">
            <p className="text-ink-muted mt-1 text-sm">
                The current one is asked for because a session is something somebody can walk up to.
            </p>

            <form onSubmit={(event) => void submit(event)} className="mt-4 max-w-sm space-y-4">
                <TextField
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    error={error}
                    onChange={(event) => setCurrent(event.target.value)}
                />
                <TextField
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                />
                <TextField
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                />

                <div className="flex items-center gap-3">
                    <Button
                        type="submit"
                        variant="primary"
                        busy={busy}
                        disabled={current === '' || next === ''}
                    >
                        Change password
                    </Button>

                    {changed && (
                        <span role="status" className="text-ink-subtle text-[13px]">
                            Changed.
                        </span>
                    )}
                </div>
            </form>
        </Section>
    );
}

/**
 * Nothing here navigates.
 *
 * Closing the account leaves the application looking at nobody, and `RequireAuth` is the one
 * thing whose job that is: it sends a guest to the sign-in page. Sending them somewhere from
 * here as well would be two redirects racing each other for the same moment, which is how the
 * invitation flow once lost the page it was trying to reach.
 */
function CloseSection({ closeAccount }: { closeAccount: (password: string) => Promise<void> }) {
    const [asking, setAsking] = useState(false);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();

        setBusy(true);
        setError(undefined);
        setRefusal(null);

        try {
            await closeAccount(password);
        } catch (caught) {
            /*
             * Two refusals that read the same and mean different things. "That is not your
             * password" is about the field and belongs under it; being the last admin of a firm
             * is about the account, and printing it under the password box says the password
             * was wrong — which it was not, and which sends somebody to retype a secret that
             * was never the problem.
             */
            const mistyped = caught instanceof ApiError ? caught.errors.password?.[0] : undefined;

            if (mistyped !== undefined) {
                setError(mistyped);
            } else {
                setRefusal(refusalFrom(caught, 'account'));
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <Section title="Close your account">
            <p className="text-ink-muted mt-1 max-w-lg text-sm">
                Your drawings go with it, and so does everything traced under them. Drawings a firm
                owns stay with the firm, and remarks you left on somebody else’s plan stay where
                they are without your name on them. This cannot be undone.
            </p>

            <Button variant="danger" className="mt-5" onClick={() => setAsking(true)}>
                Close this account
            </Button>

            <Modal
                open={asking}
                onOpenChange={(open) => {
                    setAsking(open);

                    if (!open) {
                        setPassword('');
                        setError(undefined);
                        setRefusal(null);
                    }
                }}
                title="Close this account?"
                description="Everything you own goes with it. Type your password to confirm."
            >
                <form onSubmit={(event) => void submit(event)} className="space-y-5">
                    <TextField
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        error={error}
                        onChange={(event) => setPassword(event.target.value)}
                    />

                    {refusal !== null && (
                        <p role="alert" className="text-ink text-[13px]">
                            {refusal}
                        </p>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setAsking(false)}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="danger"
                            busy={busy}
                            disabled={password === ''}
                        >
                            Close it
                        </Button>
                    </div>
                </form>
            </Modal>
        </Section>
    );
}
