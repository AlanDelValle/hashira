import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-ink text-ink-inverse hover:bg-ink/90 disabled:bg-ink/40',
    secondary:
        'bg-surface text-ink border border-line-strong hover:bg-sunken disabled:text-ink-subtle',
    ghost: 'text-ink-muted hover:bg-sunken hover:text-ink',
    danger: 'bg-danger text-white hover:bg-danger/90',
};

const SIZES: Record<Size, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-9.5 px-4 text-sm',
};

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
    variant?: Variant;
    size?: Size;
    /** Disables the button and announces the wait, without changing its width. */
    busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', busy = false, className, children, ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            type={props.type ?? 'button'}
            aria-busy={busy || undefined}
            disabled={props.disabled ?? busy}
            className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md font-medium',
                'transition-colors duration-100 select-none',
                'disabled:cursor-not-allowed disabled:opacity-70',
                VARIANTS[variant],
                SIZES[size],
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
});
