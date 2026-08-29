/**
 * The whole-screen waiting state. Deliberately quiet: a label and a mark travelling along a
 * hairline, rather than a spinning graphic that draws attention to the wait.
 */
export function FullPageSpinner({ label }: { label: string }) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="bg-canvas flex min-h-screen items-center justify-center"
        >
            <div className="w-40 space-y-3 text-center">
                <div className="bg-line h-px w-full overflow-hidden">
                    <div className="animate-sweep bg-ink-subtle h-px w-1/3" />
                </div>
                <p className="text-ink-subtle text-xs">{label}</p>
            </div>
        </div>
    );
}
