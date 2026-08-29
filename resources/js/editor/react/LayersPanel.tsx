import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';

import { replaceLayers } from '@/editor/commands/command';
import type { Layer } from '@/editor/model/types';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';

/**
 * Layers, and which one new work lands on.
 *
 * Visibility, locking and order live in the document, so each change goes through a command
 * and undoes like anything else — hiding a layer by accident is exactly what Ctrl+Z is for.
 * Which layer is *active* is not saved: that belongs to the person drawing.
 */
export function LayersPanel() {
    const layers = useDocumentStore((state) => state.document.layers);
    const activeLayerId = useEditorStore((state) => state.activeLayerId);
    const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
    const clearSelection = useEditorStore((state) => state.clearSelection);

    function update(next: Layer[], label: string) {
        runCommand(replaceLayers(layers, next, label));
    }

    function toggle(layer: Layer, field: 'visible' | 'locked') {
        const next = layers.map((current) =>
            current.id === layer.id ? { ...current, [field]: !current[field] } : current,
        );

        // Anything selected on a layer that just became hidden or locked can no longer be
        // acted on, so it should not look selected either.
        if (layer[field]) {
            clearSelection();
        }

        update(next, field === 'visible' ? 'Layer visibility' : 'Layer lock');
    }

    function move(index: number, direction: -1 | 1) {
        const target = index + direction;
        const a = layers[index];
        const b = layers[target];

        if (a === undefined || b === undefined) {
            return;
        }

        const reordered = [...layers];
        reordered[index] = { ...b, order: a.order };
        reordered[target] = { ...a, order: b.order };

        update(
            reordered.sort((first, second) => first.order - second.order),
            'Reorder layers',
        );
    }

    return (
        <ul>
            {layers.map((layer, index) => {
                const active = layer.id === activeLayerId;

                return (
                    <li
                        key={layer.id}
                        className={cn(
                            'group flex items-center gap-1.5 px-2 py-1',
                            active && 'bg-accent-soft',
                        )}
                    >
                        <IconButton
                            label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                            onClick={() => toggle(layer, 'visible')}
                        >
                            {layer.visible ? (
                                <Eye className="size-3.5" />
                            ) : (
                                <EyeOff className="size-3.5" />
                            )}
                        </IconButton>

                        <IconButton
                            label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                            onClick={() => toggle(layer, 'locked')}
                        >
                            {layer.locked ? (
                                <Lock className="size-3.5" />
                            ) : (
                                <LockOpen className="size-3.5 opacity-0 group-hover:opacity-100" />
                            )}
                        </IconButton>

                        <button
                            type="button"
                            onClick={() => setActiveLayer(layer.id)}
                            aria-pressed={active}
                            title={`Draw on ${layer.name}`}
                            className={cn(
                                'flex-1 rounded-sm px-1 text-left text-[13px]',
                                active ? 'text-accent font-medium' : 'text-ink',
                                !layer.visible && 'text-ink-subtle line-through',
                            )}
                        >
                            {layer.name}
                        </button>

                        <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                            <IconButton
                                label={`Move ${layer.name} down`}
                                disabled={index === 0}
                                onClick={() => move(index, -1)}
                            >
                                <ChevronUp className="size-3" />
                            </IconButton>
                            <IconButton
                                label={`Move ${layer.name} up`}
                                disabled={index === layers.length - 1}
                                onClick={() => move(index, 1)}
                            >
                                <ChevronDown className="size-3" />
                            </IconButton>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function IconButton({
    label,
    onClick,
    disabled = false,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'text-ink-subtle rounded-sm p-0.5 transition-colors',
                disabled ? 'cursor-not-allowed opacity-30' : 'hover:text-ink',
            )}
        >
            {children}
        </button>
    );
}
