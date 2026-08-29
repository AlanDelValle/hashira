import { useEffect, useRef } from 'react';

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
            <Toggle label="Grid" pressed={gridVisible} onClick={toggleGrid} />
            <Toggle label="Snap" pressed={snapToGrid} onClick={toggleSnap} />

            <Divider />

            <span ref={zoomRef}>100%</span>
            <span>{formatScale(settings.scale)}</span>

            <Divider />

            <span ref={cursorRef} className="tabular-nums">
                —
            </span>

            <span className="ml-auto">
                {selectionCount > 0 && `${selectionCount} selected · `}
                {elementCount} {elementCount === 1 ? 'element' : 'elements'}
            </span>
        </footer>
    );
}

function Divider() {
    return <span className="bg-line h-3 w-px" aria-hidden />;
}

function Toggle({
    label,
    pressed,
    onClick,
}: {
    label: string;
    pressed: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(
                'rounded-sm px-1 transition-colors',
                pressed ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted',
            )}
        >
            {label}
        </button>
    );
}
