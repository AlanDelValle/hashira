import { Circle, Minus, MousePointer2, Pentagon, Square } from 'lucide-react';
import type { ComponentType } from 'react';

import { cn } from '@/lib/cn';
import { useEditorStore, type ToolId } from '@/editor/store/editorStore';

interface ToolDefinition {
    id: ToolId;
    label: string;
    shortcut: string;
    Icon: ComponentType<{ className?: string }>;
}

const TOOLS: ToolDefinition[] = [
    { id: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
    { id: 'line', label: 'Line', shortcut: 'L', Icon: Minus },
    { id: 'rect', label: 'Rectangle', shortcut: 'R', Icon: Square },
    { id: 'circle', label: 'Circle', shortcut: 'C', Icon: Circle },
    { id: 'polygon', label: 'Polygon', shortcut: 'P', Icon: Pentagon },
];

export function Toolbar() {
    const tool = useEditorStore((state) => state.tool);
    const setTool = useEditorStore((state) => state.setTool);

    return (
        <div
            role="toolbar"
            aria-label="Drawing tools"
            aria-orientation="vertical"
            className="border-line bg-surface flex flex-col items-center gap-0.5 border-r py-2"
        >
            {TOOLS.map(({ id, label, shortcut, Icon }) => {
                const active = tool === id;

                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTool(id)}
                        aria-pressed={active}
                        // The shortcut lives in the tooltip rather than on the button: a rail
                        // of letters is noise once you know them, and unreadable before.
                        title={`${label}  ·  ${shortcut}`}
                        className={cn(
                            'flex size-8 items-center justify-center rounded-md transition-colors',
                            active
                                ? 'bg-accent-soft text-accent'
                                : 'text-ink-muted hover:bg-sunken hover:text-ink',
                        )}
                    >
                        <Icon className="size-4" />
                        <span className="sr-only">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
