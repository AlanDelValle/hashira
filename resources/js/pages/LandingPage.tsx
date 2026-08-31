import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Wordmark } from '@/ui/Logo';
import { SkipLink } from '@/ui/SkipLink';

import { PlanDrawing } from './landing/PlanDrawing';

const GITHUB_URL = 'https://github.com/AlanDelValle/hashira';

export function LandingPage() {
    const { user } = useAuth();

    return (
        <div className="bg-canvas">
            <SkipLink />

            <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-6">
                <Wordmark />

                <nav className="flex items-center gap-4 text-[13px] sm:gap-6">
                    {/* Repeated further down the page, so the narrowest screens can lose it. */}
                    <a
                        href={GITHUB_URL}
                        className="text-ink-muted hover:text-ink hidden rounded-sm min-[380px]:inline"
                    >
                        GitHub
                    </a>
                    {user === null ? (
                        <>
                            <Link to="/login" className="text-ink-muted hover:text-ink rounded-sm">
                                Sign in
                            </Link>
                            <Link
                                to="/register"
                                className="bg-ink text-ink-inverse rounded-md px-3 py-1.5 font-medium"
                            >
                                Start drawing
                            </Link>
                        </>
                    ) : (
                        <Link
                            to="/projects"
                            className="bg-ink text-ink-inverse rounded-md px-3 py-1.5 font-medium"
                        >
                            Open projects
                        </Link>
                    )}
                </nav>
            </header>

            <main id="content">
                <section className="mx-auto max-w-5xl px-5 pt-14 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
                    <h1 className="text-ink max-w-2xl text-[2rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
                        Design spaces. Precisely.
                    </h1>

                    <p className="text-ink-muted mt-5 max-w-xl text-base text-pretty">
                        A free and open-source 2D design tool for floor plans, interiors and
                        technical drawings. It runs in the browser and it measures in millimetres.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link
                            to={user === null ? '/register' : '/projects'}
                            className="bg-ink text-ink-inverse inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
                        >
                            {user === null ? 'Start drawing' : 'Open projects'}
                            <ArrowRight className="size-3.5" aria-hidden />
                        </Link>

                        <a
                            href={GITHUB_URL}
                            className="border-line-strong bg-surface text-ink inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium"
                        >
                            Read the source
                        </a>
                    </div>

                    <p className="text-ink-subtle mt-6 font-mono text-[11px]">
                        Everything on this page works today. What comes next — drafting depth, DXF,
                        collaboration — is written down rather than promised.{' '}
                        <a
                            href={`${GITHUB_URL}/blob/main/docs/roadmap.md`}
                            className="rounded-sm underline"
                        >
                            See the roadmap
                        </a>
                    </p>
                </section>

                <section
                    aria-label="Example drawing"
                    className="mx-auto max-w-5xl px-5 pb-20 sm:px-6 sm:pb-24"
                >
                    {/* Narrower than the text column so the sheet fills it rather than
                        floating in the middle of a wide white card: the drawing carries its
                        own proportions and is never cropped or stretched to fit. */}
                    <div className="border-line bg-sheet shadow-panel mx-auto max-w-3xl overflow-hidden rounded-lg border">
                        <PlanDrawing className="w-full" />
                    </div>
                    <p className="text-ink-subtle mt-3 text-xs">
                        Not a mock-up: this is the sample plan, exported from the editor as SVG and
                        dropped in unedited. Walls carry thickness, openings belong to the wall they
                        cut, and the dimensions are read off the geometry.
                    </p>
                </section>

                <Section title="What it does">
                    <FeatureGrid>
                        <Feature title="Walls, not lines">
                            A wall has a thickness, a length and an angle. Doors and windows are
                            hosted on it and cut a real opening; move the wall and they move with
                            it.
                        </Feature>
                        <Feature title="Snapping you can rely on">
                            Endpoints, midpoints, intersections, horizontal and vertical alignment,
                            and the grid — with a tolerance measured on screen, so it feels the same
                            at every zoom level.
                        </Feature>
                        <Feature title="Type the number">
                            Every length, thickness, angle and coordinate is an editable value.
                            Dragging is for exploring; typing is for deciding.
                        </Feature>
                        <Feature title="Dimensions, not captions">
                            A dimension stores the two points it spans and reads the distance every
                            time it is drawn. Move the wall and the value follows it — and there is
                            no way to type over it, so a sheet cannot state one length while showing
                            another.
                        </Feature>
                        <Feature title="Labels that plot">
                            A label is measured in millimetres like the rest of the drawing, so it
                            scales with the plan and not with the screen — set at 250 mm it comes
                            out 5 mm high on a 1:50 sheet. And you type it where it goes, on the
                            sheet, not into a field beside it.
                        </Feature>
                        <Feature title="Undo that holds">
                            Every change is a command with a defined inverse, so the history is
                            exact rather than approximate — including across property edits.
                        </Feature>
                        <Feature title="Vector export">
                            SVG, PNG and PDF at a real page size and a real scale, with a scale bar
                            and a title block.
                        </Feature>
                        <Feature title="Your drawing is a file">
                            A documented, versioned JSON format. You can read it, diff it, and take
                            it somewhere else.
                        </Feature>
                    </FeatureGrid>
                </Section>

                <Section title="Made for">
                    <FeatureGrid>
                        <Feature title="Floor plans">
                            Lay out a home or an apartment at 1:50 with walls, openings and room
                            labels that hold their dimensions.
                        </Feature>
                        <Feature title="Interiors">
                            Place furniture and fixtures from a small parametric library and try
                            arrangements against the real envelope.
                        </Feature>
                        <Feature title="Technical drawings">
                            Any measured 2D drawing that needs to print at a known scale on a known
                            sheet.
                        </Feature>
                    </FeatureGrid>
                </Section>

                <Section title="Open source">
                    <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                        <p className="text-ink-muted text-sm text-pretty">
                            Hashira is MIT licensed and developed in public. The editor core — the
                            geometry, the document model and the command layer — has no framework
                            dependency, so it can be read, tested and reused on its own.
                        </p>
                        <p className="text-ink-muted text-sm text-pretty">
                            The architecture, the document format and the roadmap are written down
                            rather than implied, so a contributor can find the reasoning behind a
                            decision before changing it.
                        </p>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <a href={GITHUB_URL} className="text-ink rounded-sm underline">
                            Repository
                        </a>
                        <a
                            href={`${GITHUB_URL}/blob/main/docs/architecture.md`}
                            className="text-ink rounded-sm underline"
                        >
                            Architecture
                        </a>
                        <a
                            href={`${GITHUB_URL}/blob/main/docs/document-format.md`}
                            className="text-ink rounded-sm underline"
                        >
                            Document format
                        </a>
                        <a
                            href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`}
                            className="text-ink rounded-sm underline"
                        >
                            Contributing
                        </a>
                    </div>
                </Section>

                <section className="border-line border-t">
                    <div className="mx-auto max-w-5xl px-5 py-16 text-center sm:px-6 sm:py-20">
                        <h2 className="text-ink text-2xl font-semibold tracking-tight">
                            Draw your first plan
                        </h2>
                        <p className="text-ink-muted mx-auto mt-2 max-w-md text-sm">
                            An account takes a moment, costs nothing, and your drawings stay yours.
                        </p>
                        <Link
                            to={user === null ? '/register' : '/projects'}
                            className="bg-ink text-ink-inverse mt-6 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
                        >
                            {user === null ? 'Create an account' : 'Open projects'}
                            <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="border-line border-t">
                <div className="text-ink-subtle mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <Wordmark className="opacity-70" />
                    <p>
                        MIT licensed. Not affiliated with any other design tool. Built by{' '}
                        <a href="https://github.com/AlanDelValle" className="rounded-sm underline">
                            Alan Del Valle
                        </a>
                        .
                    </p>
                </div>
            </footer>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-line border-t">
            <div className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
                <h2 className="text-ink-subtle text-[11px] font-medium tracking-widest uppercase">
                    {title}
                </h2>
                <div className="mt-8">{children}</div>
            </div>
        </section>
    );
}

function FeatureGrid({ children }: { children: ReactNode }) {
    return <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <h3 className="text-ink text-sm font-medium">{title}</h3>
            <p className="text-ink-muted mt-1.5 text-sm text-pretty">{children}</p>
        </div>
    );
}
