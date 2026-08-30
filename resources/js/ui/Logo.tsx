import { cn } from '@/lib/cn';

/**
 * The mark: an H whose crossbar is folded, and whose fold shears the letter apart — the foot
 * of one stem and the head of the other are cut loose along it.
 *
 * Drawn rather than imported so it takes the current text colour and stays crisp at any size;
 * `public/` carries the same mark as a favicon and as the touch icons. The coordinates are
 * the icon's own, measured off it at 512 and kept, so the two cannot drift apart: rendering
 * this path over the 512 px icon leaves 0.09% of the canvas disagreeing, which is the
 * antialiasing along the diagonals and nothing else.
 *
 * The viewBox is cropped to the mark itself rather than to the icon's padded canvas, so the
 * letter fills the box it is given the way a letter should.
 */
export function Logo({ className }: { className?: string }) {
    return (
        <svg
            viewBox="128 104 256 304"
            aria-hidden="true"
            className={cn('h-4 w-4', className)}
            fill="currentColor"
        >
            <path d="M 128 104 L 195 104 L 195 219.4 L 256 195 L 384 246.2 L 384 408 L 318 408 L 318 289.8 L 256 265 L 128 316.2 Z" />
            <path d="M 128 333.2 L 195 306.4 L 195 408 L 128 408 Z" />
            <path d="M 318 104 L 384 104 L 384 229.2 L 318 202.8 Z" />
        </svg>
    );
}

export function Wordmark({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            {/*
             * Set a little above the wordmark's cap height rather than at the default square
             * size. The mark is a letter, not an icon, and a letter beside a word is measured
             * against the word.
             */}
            <Logo className="h-3.5 w-3.5" />
            <span className="text-ink text-[15px] font-semibold tracking-tight">Hashira</span>
        </span>
    );
}
