import { MARK_BOX, markPaths } from '@/lib/mark';
import { cn } from '@/lib/cn';

/**
 * The mark: an H whose crossbar is folded, and whose fold shears the letter apart — the foot
 * of one stem and the head of the other are cut loose along it.
 *
 * Drawn rather than imported so it takes the current text colour and stays crisp at any size;
 * `public/` carries the same mark as a favicon and as the touch icons, and `lib/mark.ts` holds
 * the outlines both this and the PDF exporter draw from. The coordinates are the icon's own,
 * measured off it at 512 and kept, so the two cannot drift apart: rendering this path over the
 * 512 px icon leaves 0.09% of the canvas disagreeing, which is the antialiasing along the
 * diagonals and nothing else.
 *
 * The viewBox is cropped to the mark itself rather than to the icon's padded canvas, so the
 * letter fills the box it is given the way a letter should.
 */
export function Logo({ className }: { className?: string }) {
    return (
        <svg
            viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`}
            aria-hidden="true"
            className={cn('h-4 w-4', className)}
            fill="currentColor"
        >
            {markPaths().map((d) => (
                <path key={d} d={d} />
            ))}
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
