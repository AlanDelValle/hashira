import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

interface MeasureFieldProps {
    label: string;
    /** The canonical value: millimetres for a length, radians for an angle. */
    value: number;
    format: (value: number) => string;
    /** Returns null when the text is not a value, in which case the field reverts. */
    parse: (text: string) => number | null;
    onCommit: (value: number) => void;
    suffix?: string;
}

/**
 * A value in the drawing, editable by typing it.
 *
 * The field keeps a draft while it is focused and commits on Enter or blur, so a half-typed
 * "3." never reaches the document. Escape abandons the draft. It re-syncs from the document
 * whenever the value changes underneath it — which happens constantly while the same element
 * is being dragged — but only when it is not the thing being typed into.
 */
export function MeasureField({ label, value, format, parse, onCommit, suffix }: MeasureFieldProps) {
    const id = useId();
    const [draft, setDraft] = useState(() => format(value));
    const focused = useRef(false);

    /*
     * Escape has to be able to say "not this one" to the blur it causes.
     *
     * Putting the draft back and then blurring is not enough, and used to be exactly what this
     * did: `setDraft` schedules a render, while `blur()` dispatches synchronously, so the blur
     * handler still closed over the draft being abandoned — and committed the very value
     * Escape was pressed to throw away.
     */
    const abandoning = useRef(false);

    useEffect(() => {
        if (!focused.current) {
            setDraft(format(value));
        }
    }, [value, format]);

    function commit() {
        const parsed = parse(draft);

        if (parsed === null) {
            setDraft(format(value));

            return;
        }

        onCommit(parsed);
        setDraft(format(parsed));
    }

    return (
        <div className="flex items-center justify-between gap-2">
            <label htmlFor={id} className="text-ink-muted text-[13px]">
                {label}
            </label>

            <div className="relative">
                <input
                    id={id}
                    value={draft}
                    inputMode="decimal"
                    onFocus={() => {
                        focused.current = true;
                    }}
                    onBlur={() => {
                        focused.current = false;

                        if (abandoning.current) {
                            abandoning.current = false;
                            setDraft(format(value));

                            return;
                        }

                        commit();
                    }}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.code === 'NumpadEnter') {
                            event.currentTarget.blur();
                        }

                        if (event.key === 'Escape') {
                            abandoning.current = true;
                            event.currentTarget.blur();
                        }
                    }}
                    className={cn(
                        'border-line-strong bg-surface text-ink h-6 w-24 rounded-sm border text-right font-mono text-[12px]',
                        'hover:border-ink-subtle focus:border-accent transition-colors',
                        suffix === undefined ? 'px-1.5' : 'pr-6 pl-1.5',
                    )}
                />

                {suffix !== undefined && (
                    <span className="text-ink-subtle pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 font-mono text-[11px]">
                        {suffix}
                    </span>
                )}
            </div>
        </div>
    );
}

/** A read-only row, for values the drawing derives rather than stores. */
export function ReadonlyRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted text-[13px]">{label}</span>
            <span className="text-ink font-mono text-[12px]">{value}</span>
        </div>
    );
}

export function ToggleRow({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    const id = useId();

    return (
        <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="text-ink-muted text-[13px]">
                {label}
            </label>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="accent-accent size-3.5"
            />
        </div>
    );
}

export function ChoiceRow<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    const id = useId();

    return (
        <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="text-ink-muted text-[13px]">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value as T)}
                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-6 w-24 rounded-sm border px-1 text-[12px] transition-colors"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
