import { useEffect, useRef } from 'react';

import { REFERENCE_KEY } from '@/editor/input/shortcuts';
import { formatScale } from '@/editor/model/units';
import { bindReadout } from '@/editor/render/readout';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';

/**
 * The bottom rule.
 *
 * Cursor position and zoom are written straight into their spans by the render loop — see
 * render/readout.ts — so a pointer moving across the canvas never re-renders this component.
 * Everything else here changes only when someone clicks something.
 */
export function StatusBar() {
    const settings = useDocumentStore((state) => state.document.settings);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const selectionCount = useEditorStore((state) => state.selection.length);
    const gridVisible = useEditorStore((state) => state.gridVisible);
    const snapToGrid = useEditorStore((state) => state.snapToGrid);
    const toggleGrid = useEditorStore((state) => state.toggleGrid);
    const toggleSnap = useEditorStore((state) => state.toggleSnap);
    const setShortcutsOpen = useEditorStore((state) => state.setShortcutsOpen);

    const cursorRef = useRef<HTMLSpanElement>(null);
    const zoomRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        bindReadout('cursor', cursorRef.current);
        bindReadout('zoom', zoomRef.current);

        return () => {
            bindReadout('cursor', null);
            bindReadout('zoom', null);
        };
    }, []);

    return (
        <footer className="border-line bg-surface text-ink-subtle flex items-center gap-4 border-t px-3 font-mono text-[11px]">
            <Toggle label="Grid" pressed={gridVisible} shortcut="G" onClick={toggleGrid} />
            <Toggle label="Snap" pressed={snapToGrid} shortcut="S" onClick={toggleSnap} />

            <Divider />

            <span className="flex items-center gap-1">
                <span className="sr-only">Zoom</span>
                <span ref={zoomRef}>100%</span>
            </span>
            <span>{formatScale(settings.scale)}</span>

            <Divider />

            <span className="flex items-center gap-1">
                <span className="sr-only">Pointer</span>
                <span ref={cursorRef} className="tabular-nums">
                    —
                </span>
            </span>

            <span className="ml-auto">
                {selectionCount > 0 && `${selectionCount} selected · `}
                {elementCount} {elementCount === 1 ? 'element' : 'elements'}
            </span>

            <Divider />

            {/*
             * The one place the keyboard reference is advertised. `?` opens it too, but a key
             * you have to already know about is not a discoverable one.
             */}
            <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-keyshortcuts={REFERENCE_KEY}
                className="text-ink-subtle hover:text-ink rounded-sm px-1 transition-colors"
            >
                Shortcuts {REFERENCE_KEY}
            </button>
        </footer>
    );
}

function Divider() {
    return <span className="bg-line h-3 w-px" aria-hidden />;
}

function Toggle({
    label,
    pressed,
    shortcut,
    onClick,
}: {
    label: string;
    pressed: boolean;
    shortcut: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            aria-keyshortcuts={shortcut}
            title={`${label}  ·  ${shortcut}`}
            className={cn(
                'rounded-sm px-1 transition-colors',
                pressed ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted',
            )}
        >
            {label}
        </button>
    );
}
