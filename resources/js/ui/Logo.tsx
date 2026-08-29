import { cn } from '@/lib/cn';

/**
 * A column seen in plan: the outline of the space, the pillar standing in it. Drawn rather
 * than imported so it inherits the current text colour and stays crisp at every size.
 */
export function Logo({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={cn('h-4 w-4', className)}
            fill="none"
            stroke="currentColor"
        >
            <rect x="1.5" y="1.5" width="13" height="13" strokeWidth="1.25" />
            <path d="M6 1.5v13" strokeWidth="2.5" />
        </svg>
    );
}

export function Wordmark({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            <Logo />
            <span className="text-ink text-[15px] font-semibold tracking-tight">Hashira</span>
        </span>
    );
}
