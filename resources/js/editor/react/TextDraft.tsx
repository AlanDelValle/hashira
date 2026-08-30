import { useEffect, useRef, useState } from 'react';

import type { Point } from '@/editor/geometry/vec';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { commitText } from '@/editor/tools/textTool';
import { toScreen } from '@/editor/viewport/viewport';

/**
 * Typing a label, in place.
 *
 * A real input floated over the sheet at the point that was clicked, because a canvas has no
 * caret, no selection and no input method — and a tool that cannot take an input method cannot
 * write half the names it will be asked to write.
 *
 * It is positioned and sized from the same viewport transform the renderer uses, so what is
 * being typed sits where the finished label will sit, at the size it will be. Enter or a click
 * elsewhere commits it; Escape throws it away; blank is not a label.
 */
export function TextDraft() {
    const draft = useEditorStore((state) => state.textDraft);

    if (draft === null) {
        return null;
    }

    // Keyed on the draft, so each new one arrives with an empty field rather than the last
    // label's wording left in it.
    return <Field key={draft.id} at={draft.at} />;
}

function Field({ at }: { at: Point }) {
    const size = useEditorStore((state) => state.textSize);
    const cancel = useEditorStore((state) => state.cancelText);
    const viewport = useViewportStore((state) => state.viewport);

    const [content, setContent] = useState('');
    const field = useRef<HTMLInputElement>(null);

    /*
     * Focused a frame late, on purpose.
     *
     * The click that opens this field is a click on the canvas, and the canvas is focusable so
     * that it can take the keyboard. The browser moves focus there as the *default action* of
     * that same mousedown — after the handler that opened the field has run. An `autoFocus`
     * here therefore wins for a moment and is then taken away, and the blur that follows
     * commits an empty label and closes the field before a single character can be typed.
     * Waiting for the next frame lets the browser finish, and then takes the keyboard.
     */
    useEffect(() => {
        const frame = requestAnimationFrame(() => field.current?.focus());

        return () => cancelAnimationFrame(frame);
    }, []);

    const screen = toScreen(viewport, at);

    /*
     * The label's cap height in screen pixels. Clamped at the bottom only: below about eleven
     * pixels there is no visible caret and no way to catch a typo, and an input nobody can
     * read is worse than one that is briefly the wrong size.
     */
    const fontSize = Math.max(11, size * viewport.zoom);

    function commit() {
        commitText(content, at);
        cancel();
    }

    return (
        <input
            ref={field}
            value={content}
            aria-label="Label text"
            placeholder="Label"
            onChange={(event) => setContent(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                // The editor's own listener already stands aside for an input; this keeps the
                // keys from travelling any further than the field.
                event.stopPropagation();

                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                }
            }}
            style={{
                left: `${screen.x}px`,
                top: `${screen.y}px`,
                fontSize: `${fontSize}px`,
                // Centred on the anchor, and lifted so the text sits on the baseline the
                // renderer will draw it on rather than hanging below it.
                transform: 'translate(-50%, -0.82em)',
            }}
            className="border-accent bg-sheet text-ink absolute min-w-24 rounded-xs border px-1 text-center leading-none outline-none"
        />
    );
}
