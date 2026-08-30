/**
 * The first thing a keyboard reaches on a page, and invisible until it is reached.
 *
 * Every page here puts navigation before content, which is one Tab press for a mouse and a
 * dozen for a keyboard. This is the way out of that.
 */
export function SkipLink({
    to = 'content',
    children = 'Skip to content',
}: {
    /** The `id` of the element to jump to. */
    to?: string;
    children?: string;
}) {
    return (
        <a
            href={`#${to}`}
            className="border-line bg-surface text-ink shadow-panel sr-only rounded-md border px-3 py-2 text-[13px] font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
            {children}
        </a>
    );
}
