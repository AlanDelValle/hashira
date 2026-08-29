import { ChevronLeft, Eye, EyeOff, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { summarize } from '@/editor/model/summary';
import { useDocument } from '@/projects/useDocument';
import { FullPageSpinner } from '@/ui/FullPageSpinner';
import { Logo } from '@/ui/Logo';

/**
 * The editor frame. The drawing surface itself — canvas, viewport, tools — is Phase 2; this
 * screen already loads and reads the real document rather than standing in for one.
 */
export function EditorPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { document, loading, error } = useDocument(projectId);

    if (loading) {
        return <FullPageSpinner label="Opening drawing" />;
    }

    if (error !== null || document === null) {
        return (
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p role="alert" className="text-ink text-sm">
                        {error ?? 'Could not open this drawing.'}
                    </p>
                    <Link
                        to="/projects"
                        className="text-ink-muted mt-4 inline-block rounded-sm text-sm underline"
                    >
                        Back to projects
                    </Link>
                </div>
            </div>
        );
    }

    const summary = summarize(document.drawing);

    return (
        <>
            {/* The editor is a pointer-and-precision tool; a phone cannot give it a good home. */}
            <div className="bg-canvas flex min-h-screen items-center justify-center px-6 lg:hidden">
                <div className="max-w-xs text-center">
                    <Logo className="text-ink-subtle mx-auto size-5" />
                    <p className="text-ink mt-4 text-sm">The editor needs a larger screen.</p>
                    <p className="text-ink-muted mt-1.5 text-sm">
                        Drafting depends on precise pointing and a lot of visible sheet. Open this
                        project on a desktop display.
                    </p>
                    <Link
                        to="/projects"
                        className="text-ink-muted mt-5 inline-block rounded-sm text-sm underline"
                    >
                        Back to projects
                    </Link>
                </div>
            </div>

            <div className="bg-canvas hidden h-screen grid-rows-[3rem_1fr_1.75rem] lg:grid">
                <header className="border-line bg-surface flex items-center gap-3 border-b px-3">
                    <Link
                        to="/projects"
                        className="text-ink-muted hover:bg-sunken hover:text-ink flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px]"
                    >
                        <ChevronLeft className="size-3.5" aria-hidden />
                        Projects
                    </Link>

                    <span className="bg-line h-4 w-px" aria-hidden />

                    <h1 className="text-ink text-[13px] font-medium">{document.name}</h1>
                </header>

                <div className="grid grid-cols-[1fr_15rem] overflow-hidden">
                    <section
                        aria-label="Drawing surface"
                        className="border-line flex items-center justify-center border-r"
                    >
                        <p className="text-ink-subtle max-w-xs text-center text-[13px]">
                            The drawing surface arrives with the editor core. This document loaded
                            from the server with {summary.elementCount}{' '}
                            {summary.elementCount === 1 ? 'element' : 'elements'}.
                        </p>
                    </section>

                    <aside aria-label="Document" className="bg-surface overflow-y-auto">
                        <PanelSection title="Layers">
                            <ul>
                                {summary.layers.map((layer) => (
                                    <li
                                        key={layer.id}
                                        className="text-ink flex items-center gap-2 px-3 py-1.5 text-[13px]"
                                    >
                                        {layer.visible ? (
                                            <Eye
                                                className="text-ink-subtle size-3.5"
                                                aria-label="Visible"
                                            />
                                        ) : (
                                            <EyeOff
                                                className="text-ink-subtle size-3.5"
                                                aria-label="Hidden"
                                            />
                                        )}
                                        <span className="flex-1">{layer.name}</span>
                                        {layer.locked && (
                                            <Lock
                                                className="text-ink-subtle size-3"
                                                aria-label="Locked"
                                            />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </PanelSection>

                        <PanelSection title="Document">
                            <dl className="space-y-1.5 px-3 text-[13px]">
                                <Row label="Elements" value={String(summary.elementCount)} />
                                <Row label="Units" value={summary.unit} />
                                <Row label="Scale" value={`1:${summary.scale}`} />
                                <Row label="Schema" value={`v${summary.schemaVersion ?? '?'}`} />
                                <Row label="Revision" value={String(document.revision)} />
                            </dl>
                        </PanelSection>
                    </aside>
                </div>

                <footer className="border-line bg-surface text-ink-subtle flex items-center gap-4 border-t px-3 font-mono text-[11px]">
                    <span>1:{summary.scale}</span>
                    <span>{summary.unit}</span>
                    <span>{summary.elementCount} elements</span>
                </footer>
            </div>
        </>
    );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-line border-b py-2.5">
            <h2 className="text-ink-subtle px-3 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-ink font-mono">{value}</dd>
        </div>
    );
}
