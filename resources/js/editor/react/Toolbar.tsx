import {
    AppWindow,
    Circle,
    Columns2,
    DoorOpen,
    Minus,
    MousePointer2,
    Pentagon,
    Sofa,
    Square,
    SquareDashed,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { useEditorStore, type ToolId } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';

interface ToolDefinition {
    id: ToolId;
    label: string;
    shortcut: string;
    Icon: ComponentType<{ className?: string }>;
}

/** Grouped the way the work goes: pick, build, annotate the shape of the space, then draw. */
const GROUPS: ToolDefinition[][] = [
    [{ id: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 }],
    [
        { id: 'wall', label: 'Wall', shortcut: 'W', Icon: Columns2 },
        { id: 'door', label: 'Door', shortcut: 'D', Icon: DoorOpen },
        { id: 'window', label: 'Window', shortcut: 'N', Icon: AppWindow },
        { id: 'room', label: 'Room', shortcut: 'O', Icon: SquareDashed },
    ],
    [
        { id: 'line', label: 'Line', shortcut: 'L', Icon: Minus },
        { id: 'rect', label: 'Rectangle', shortcut: 'R', Icon: Square },
        { id: 'circle', label: 'Circle', shortcut: 'C', Icon: Circle },
        { id: 'polygon', label: 'Polygon', shortcut: 'P', Icon: Pentagon },
    ],
];

export function Toolbar({
    libraryOpen,
    onToggleLibrary,
}: {
    libraryOpen: boolean;
    onToggleLibrary: () => void;
}) {
    const tool = useEditorStore((state) => state.tool);
    const setTool = useEditorStore((state) => state.setTool);

    return (
        <div
            role="toolbar"
            aria-label="Drawing tools"
            aria-orientation="vertical"
            className="border-line bg-surface flex flex-col items-center gap-0.5 border-r py-2"
        >
            {GROUPS.map((group, index) => (
                <div key={index} className="flex flex-col items-center gap-0.5">
                    {index > 0 && <span className="bg-line my-1 h-px w-5" aria-hidden />}

                    {group.map(({ id, label, shortcut, Icon }) => (
                        <ToolButton
                            key={id}
                            label={label}
                            shortcut={shortcut}
                            active={tool === id}
                            onClick={() => setTool(id)}
                        >
                            <Icon className="size-4" />
                        </ToolButton>
                    ))}
                </div>
            ))}

            <span className="bg-line my-1 h-px w-5" aria-hidden />

            <ToolButton
                label="Library"
                shortcut="B"
                active={libraryOpen || tool === 'asset'}
                onClick={onToggleLibrary}
            >
                <Sofa className="size-4" />
            </ToolButton>
        </div>
    );
}

function ToolButton({
    label,
    shortcut,
    active,
    onClick,
    children,
}: {
    label: string;
    shortcut: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
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
