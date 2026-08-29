import { forwardRef, useId, type ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export interface TextFieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
    label: string;
    error?: string | undefined;
    hint?: string | undefined;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
    { label, error, hint, className, ...props },
    ref,
) {
    const id = useId();
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const describedBy = [error ? errorId : null, hint ? hintId : null]
        .filter((value): value is string => value !== null)
        .join(' ');

    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-ink block text-[13px] font-medium">
                {label}
            </label>

            <input
                ref={ref}
                id={id}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy || undefined}
                className={cn(
                    'bg-surface text-ink block h-9.5 w-full rounded-md border px-3 text-sm',
                    'placeholder:text-ink-subtle',
                    'transition-colors duration-100',
                    error ? 'border-danger' : 'border-line-strong hover:border-ink-subtle',
                    className,
                )}
                {...props}
            />

            {hint !== undefined && !error && (
                <p id={hintId} className="text-ink-subtle text-xs">
                    {hint}
                </p>
            )}

            {error !== undefined && (
                <p id={errorId} className="text-danger text-xs">
                    {error}
                </p>
            )}
        </div>
    );
});
