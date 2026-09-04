import { useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import type { ProjectPerson } from '@/types/api';

/**
 * A comment box that can name somebody.
 *
 * Typing `@` and a few letters offers the people on the project; choosing one writes their
 * whole name in. That is not decoration — the server resolves a mention by matching a roster
 * name in the text, so the picker exists to put an exact name there rather than leaving
 * somebody to spell it and wonder why nothing happened.
 *
 * The list is keyboard-first: arrows move, Enter or Tab takes the highlighted name, Escape
 * dismisses the list without dismissing what is being written. Enter only sends when no list
 * is open, so choosing a name cannot post a half-written remark.
 */
export function MentionField({
    value,
    onChange,
    people,
    label,
    placeholder,
    rows = 3,
    autoFocusOnMount = false,
    onSubmit,
    onEscape,
}: {
    value: string;
    onChange: (value: string) => void;
    people: ProjectPerson[];
    label: string;
    placeholder: string;
    rows?: number;
    autoFocusOnMount?: boolean;
    onSubmit?: () => void;
    onEscape?: () => void;
}) {
    const field = useRef<HTMLTextAreaElement>(null);
    const [query, setQuery] = useState<{ at: number; text: string } | null>(null);
    const [highlighted, setHighlighted] = useState(0);

    const matches =
        query === null
            ? []
            : people
                  .filter((person) =>
                      person.name.toLowerCase().startsWith(query.text.toLowerCase()),
                  )
                  .slice(0, 6);

    const open = matches.length > 0;

    function read(next: string, caret: number) {
        onChange(next);

        /*
         * The `@` being typed at, if there is one: the last one before the caret with no space
         * between it and the caret. A name can have spaces in it, which is why the query is
         * taken from the `@` rather than from the last word — but a run long enough to be a
         * sentence is somebody writing prose, not choosing a name.
         */
        const before = next.slice(0, caret);
        const at = before.lastIndexOf('@');
        const text = at < 0 ? '' : before.slice(at + 1);

        setQuery(at >= 0 && text.length <= 40 && !text.includes('\n') ? { at, text } : null);
        setHighlighted(0);
    }

    function choose(person: ProjectPerson) {
        if (query === null) return;

        const head = value.slice(0, query.at);
        const tail = value.slice(query.at + 1 + query.text.length);
        const next = `${head}@${person.name}${tail.startsWith(' ') ? '' : ' '}${tail}`;

        onChange(next);
        setQuery(null);

        // Put the caret after the name that was just written, not back at the end of the box.
        const caret = head.length + 1 + person.name.length + 1;

        requestAnimationFrame(() => {
            field.current?.focus();
            field.current?.setSelectionRange(caret, caret);
        });
    }

    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        // The editor's own listener stands aside for a field; this keeps the keys from
        // travelling any further, so typing a name cannot switch the tool underneath it.
        event.stopPropagation();

        if (open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlighted(
                    (current) =>
                        (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) %
                        matches.length,
                );

                return;
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
                const person = matches[highlighted];

                if (person !== undefined) {
                    event.preventDefault();
                    choose(person);

                    return;
                }
            }

            if (event.key === 'Escape') {
                // Dismisses the list, and only the list: what is being written stays.
                event.preventDefault();
                setQuery(null);

                return;
            }
        }

        if (event.key === 'Escape') {
            onEscape?.();
        }

        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit?.();
        }
    }

    return (
        <div className="relative">
            <textarea
                ref={field}
                value={value}
                rows={rows}
                aria-label={label}
                placeholder={placeholder}
                autoFocus={autoFocusOnMount}
                onChange={(event) => read(event.target.value, event.target.selectionStart)}
                onKeyDown={onKeyDown}
                onBlur={() => setQuery(null)}
                className="border-line-strong bg-sunken text-ink w-full resize-y rounded-md border px-2 py-1.5 text-[13px]"
            />

            {open && (
                <ul
                    role="listbox"
                    aria-label="People on this project"
                    className="border-line bg-surface shadow-panel absolute right-0 bottom-full left-0 z-20 mb-1 overflow-hidden rounded-md border"
                >
                    {matches.map((person, index) => (
                        <li key={person.id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={index === highlighted}
                                // The blur that a click would cause closes the list first, so
                                // the choice is taken on pointer-down instead.
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    choose(person);
                                }}
                                className={cn(
                                    'block w-full px-2.5 py-1.5 text-left text-[13px]',
                                    index === highlighted
                                        ? 'bg-accent-soft text-accent-strong'
                                        : 'text-ink hover:bg-sunken',
                                )}
                            >
                                {person.name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
