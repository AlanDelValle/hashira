import {
    Angle,
    AppWindow,
    Circle,
    Columns2,
    Diameter,
    DoorOpen,
    Minus,
    MousePointer2,
    Pentagon,
    Sofa,
    Ruler,
    Square,
    SquareDashed,
    TextQuote,
    Type,
} from 'lucide-react';
import { useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';

import { LIBRARY_KEY, TOOL_SHORTCUTS } from '@/editor/input/shortcuts';
import { useEditorStore, type ToolId } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';

const ICONS: Record<ToolId, ComponentType<{ className?: string }>> = {
    select: MousePointer2,
    wall: Columns2,
    door: DoorOpen,
    window: AppWindow,
    room: SquareDashed,
    line: Minus,
    rect: Square,
    circle: Circle,
    polygon: Pentagon,
    text: Type,
    dimension: Ruler,
    angle: Angle,
    radius: Diameter,
    leader: TextQuote,
    asset: Sofa,
};

/** Grouped the way the work goes: pick, build the space, draw, then say what it is. */
const GROUPS: ToolId[][] = [
    ['select'],
    ['wall', 'door', 'window', 'room'],
    ['line', 'rect', 'circle', 'polygon'],
    ['dimension', 'angle', 'radius'],
    ['text', 'leader'],
];

/**
 * The tool rail.
 *
 * Labels and keys come from the shortcut table rather than being written here, so a tooltip
 * cannot promise a key nothing listens for — which is exactly how the library button came to
 * advertise a `B` that did nothing.
 *
 * Keyboard behaviour follows the ARIA toolbar pattern: the rail is one tab stop and the arrow
 * keys move within it, so nobody has to press Tab nine times to get past it.
 */
export function Toolbar() {
    const tool = useEditorStore((state) => state.tool);
    const setTool = useEditorStore((state) => state.setTool);
    const libraryOpen = useEditorStore((state) => state.libraryOpen);
    const toggleLibrary = useEditorStore((state) => state.toggleLibrary);

    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const order = [...GROUPS.flat(), 'library' as const];
    const activeIndex = Math.max(0, order.indexOf(tool === 'asset' ? 'library' : tool));
    const [focusIndex, setFocusIndex] = useState<number | null>(null);
    const roving = focusIndex ?? activeIndex;

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!event.key.startsWith('Arrow') && event.key !== 'Home' && event.key !== 'End') {
            return;
        }

        // Whatever the rail handles, the canvas must not also act on: arrowing between tools
        // would otherwise nudge the selection at the same time.
        event.stopPropagation();

        const next = {
            ArrowDown: (roving + 1) % order.length,
            ArrowUp: (roving - 1 + order.length) % order.length,
            Home: 0,
            End: order.length - 1,
        }[event.key];

        if (next === undefined) {
            return;
        }

        event.preventDefault();
        setFocusIndex(next);
        buttons.current[next]?.focus();
    }

    let index = -1;

    return (
        <div
            role="toolbar"
            aria-label="Drawing tools"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
            className="border-line bg-surface flex flex-col items-center gap-0.5 border-r py-2"
        >
            {GROUPS.map((group, groupIndex) => (
                <div key={groupIndex} className="flex flex-col items-center gap-0.5">
                    {groupIndex > 0 && <Rule />}

                    {group.map((id) => {
                        const shortcut = TOOL_SHORTCUTS.find((entry) => entry.id === id);
                        const Icon = ICONS[id];
                        const position = ++index;

                        return (
                            <ToolButton
                                key={id}
                                ref={(node) => {
                                    buttons.current[position] = node;
                                }}
                                label={shortcut?.label ?? id}
                                shortcut={shortcut?.key ?? ''}
                                active={tool === id}
                                tabbable={position === roving}
                                onClick={() => setTool(id)}
                            >
                                <Icon className="size-4" />
                            </ToolButton>
                        );
                    })}
                </div>
            ))}

            <Rule />

            <ToolButton
                ref={(node) => {
                    buttons.current[order.length - 1] = node;
                }}
                label="Library"
                shortcut={LIBRARY_KEY}
                active={libraryOpen || tool === 'asset'}
                tabbable={roving === order.length - 1}
                onClick={toggleLibrary}
            >
                <Sofa className="size-4" />
            </ToolButton>
        </div>
    );
}

function Rule() {
    return <span className="bg-line my-1 h-px w-5" aria-hidden />;
}

function ToolButton({
    ref,
    label,
    shortcut,
    active,
    tabbable,
    onClick,
    children,
}: {
    ref: (node: HTMLButtonElement | null) => void;
    label: string;
    shortcut: string;
    active: boolean;
    tabbable: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            aria-keyshortcuts={shortcut}
            tabIndex={tabbable ? 0 : -1}
            // The shortcut lives in the tooltip rather than on the button: a rail of letters is
            // noise once you know them, and unreadable before.
            title={`${label}  ·  ${shortcut}`}
            className={cn(
                'flex size-8 items-center justify-center rounded-md transition-colors',
                active
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-muted hover:bg-sunken hover:text-ink',
            )}
        >
            {children}
            <span className="sr-only">{label}</span>
        </button>
    );
}
