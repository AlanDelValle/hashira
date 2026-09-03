import {
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Eye,
    EyeOff,
    Lock,
    LockOpen,
    Plus,
    Trash2,
} from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { combine, replaceElements, replaceLayers } from '@/editor/commands/command';
import { makeLookup } from '@/editor/model/elements';
import {
    addLayer,
    elementsOn,
    moveLayer,
    moveToLayer,
    recolourLayer,
    removeLayer,
    renameLayer,
} from '@/editor/model/layers';
import { elementName, isNamed } from '@/editor/model/naming';
import type { Element, Layer } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';
import { cn } from '@/lib/cn';

/**
 * The layers, and what is standing on each of them.
 *
 * Visibility, locking, order, names and colours are all **in the document**, so every one of
 * them is a command and undoes like any other edit — hiding a layer by accident is exactly
 * what Ctrl+Z is for. Which layer is *active* is not saved: that belongs to the person drawing.
 *
 * An element names itself rather than storing a name — see `model/naming.ts` — and a name
 * somebody types goes to `metadata.label`, a field that has been in the format since version 1
 * and that nothing read until this panel.
 *
 * Layers are shut until they are opened, which is the whole of the performance story: a plan
 * with several hundred elements renders several hundred rows only when somebody asks to see
 * them, and the count on the row says how many that would be first.
 */
export function SceneTree() {
    const drawing = useDocumentStore((state) => state.document);
    const selection = useEditorStore((state) => state.selection);
    const activeLayerId = useEditorStore((state) => state.activeLayerId);
    const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
    const select = useEditorStore((state) => state.select);
    const clearSelection = useEditorStore((state) => state.clearSelection);

    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
    const [renaming, setRenaming] = useState<string | null>(null);
    const [emptying, setEmptying] = useState<string | null>(null);

    /*
     * A row that disappears from under the pointer never gets its leave event — collapsing a
     * layer, or an element going somewhere else — and the highlight it left would stay on the
     * drawing with nothing pointing at it. The canvas overwrites the hover the moment the
     * pointer returns to it, so this only matters when the pointer never does.
     */
    useEffect(
        () => () => {
            if (interaction.hoveredId !== null) {
                interaction.hoveredId = null;
                requestRepaint();
            }
        },
        [],
    );

    const { layers, elements } = drawing;
    const lookup = makeLookup(elements);
    const chosen = new Set(selection);

    function layersTo(next: Layer[], label: string) {
        runCommand(replaceLayers(layers, next, label));
    }

    function toggle(layer: Layer, field: 'visible' | 'locked') {
        // Anything selected on a layer that just became hidden or locked can no longer be
        // acted on, so it should not look selected either.
        if (layer[field]) {
            clearSelection();
        }

        layersTo(
            layers.map((current) =>
                current.id === layer.id ? { ...current, [field]: !current[field] } : current,
            ),
            field === 'visible' ? 'Layer visibility' : 'Layer lock',
        );
    }

    /**
     * Delete a layer, having first moved whatever was standing on it.
     *
     * One command rather than two, so a layer and its contents cannot end up half moved by an
     * undo landing between them.
     */
    function discard(layer: Layer, moveTo: string | null) {
        const standing = elementsOn(elements, layer.id);
        const steps = [];

        if (standing.length > 0 && moveTo !== null) {
            steps.push(
                replaceElements(standing, moveToLayer(standing, moveTo), 'Move to layer', null),
            );
        }

        steps.push(replaceLayers(layers, removeLayer(layers, layer.id), 'Delete layer'));

        if (activeLayerId === layer.id) {
            const survivor = layers.find((candidate) => candidate.id !== layer.id);

            if (survivor !== undefined) {
                setActiveLayer(survivor.id);
            }
        }

        setEmptying(null);
        runCommand(combine('Delete layer', steps));
    }

    return (
        <div>
            <ul>
                {layers.map((layer, index) => {
                    const standing = elementsOn(elements, layer.id);
                    const shown = open.has(layer.id);
                    const active = layer.id === activeLayerId;

                    return (
                        <li key={layer.id}>
                            <div
                                className={cn(
                                    'group relative flex items-center gap-1 px-1.5 py-1',
                                    active && 'bg-accent-soft',
                                )}
                            >
                                <IconButton
                                    label={
                                        shown ? `Collapse ${layer.name}` : `Expand ${layer.name}`
                                    }
                                    onClick={() =>
                                        setOpen((current) => {
                                            const next = new Set(current);

                                            if (!next.delete(layer.id)) next.add(layer.id);

                                            return next;
                                        })
                                    }
                                >
                                    {shown ? (
                                        <ChevronDown className="size-3.5" />
                                    ) : (
                                        <ChevronRight className="size-3.5" />
                                    )}
                                </IconButton>

                                <IconButton
                                    label={
                                        layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`
                                    }
                                    onClick={() => toggle(layer, 'visible')}
                                >
                                    {layer.visible ? (
                                        <Eye className="size-3.5" />
                                    ) : (
                                        <EyeOff className="size-3.5" />
                                    )}
                                </IconButton>

                                <IconButton
                                    label={
                                        layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`
                                    }
                                    onClick={() => toggle(layer, 'locked')}
                                >
                                    {layer.locked ? (
                                        <Lock className="size-3.5" />
                                    ) : (
                                        <LockOpen className="size-3.5 opacity-0 group-hover:opacity-100" />
                                    )}
                                </IconButton>

                                <input
                                    type="color"
                                    value={layer.color}
                                    aria-label={`Colour of ${layer.name}`}
                                    onChange={(event) =>
                                        layersTo(
                                            recolourLayer(layers, layer.id, event.target.value),
                                            'Layer colour',
                                        )
                                    }
                                    className="border-line-strong size-3 shrink-0 cursor-pointer appearance-none rounded-[2px] border bg-transparent"
                                />

                                {renaming === layer.id ? (
                                    <NameField
                                        value={layer.name}
                                        label={`Rename ${layer.name}`}
                                        onCommit={(name) => {
                                            layersTo(
                                                renameLayer(layers, layer.id, name),
                                                'Rename layer',
                                            );
                                            setRenaming(null);
                                        }}
                                        onCancel={() => setRenaming(null)}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setActiveLayer(layer.id)}
                                        onDoubleClick={() => setRenaming(layer.id)}
                                        aria-pressed={active}
                                        title={`Draw on ${layer.name} · double click to rename`}
                                        className={cn(
                                            'flex-1 truncate rounded-sm px-1 text-left text-[13px]',
                                            active ? 'text-accent font-medium' : 'text-ink',
                                            !layer.visible && 'text-ink-subtle line-through',
                                        )}
                                    >
                                        {layer.name}
                                    </button>
                                )}

                                <span className="text-ink-subtle shrink-0 font-mono text-[11px]">
                                    {standing.length}
                                </span>

                                {/*
                                 * Laid over the row rather than in it. Kept in the flow these
                                 * took their width whether they were showing or not, and the
                                 * layer names were truncated to pay for buttons nobody could
                                 * see — which is the sort of thing a panel this narrow cannot
                                 * afford.
                                 */}
                                <span className="bg-surface group-hover:bg-accent-soft/0 absolute inset-y-0 right-1 hidden items-center group-hover:flex">
                                    <IconButton
                                        label={`Move ${layer.name} down`}
                                        disabled={index === 0}
                                        onClick={() =>
                                            layersTo(moveLayer(layers, index, -1), 'Reorder layers')
                                        }
                                    >
                                        <ChevronUp className="size-3" />
                                    </IconButton>
                                    <IconButton
                                        label={`Move ${layer.name} up`}
                                        disabled={index === layers.length - 1}
                                        onClick={() =>
                                            layersTo(moveLayer(layers, index, 1), 'Reorder layers')
                                        }
                                    >
                                        <ChevronDown className="size-3" />
                                    </IconButton>
                                    <IconButton
                                        label={`Delete ${layer.name}`}
                                        disabled={layers.length <= 1}
                                        onClick={() =>
                                            standing.length === 0
                                                ? discard(layer, null)
                                                : setEmptying(layer.id)
                                        }
                                    >
                                        <Trash2 className="size-3" />
                                    </IconButton>
                                </span>
                            </div>

                            {emptying === layer.id && (
                                <Emptying
                                    layer={layer}
                                    others={layers.filter((other) => other.id !== layer.id)}
                                    count={standing.length}
                                    onMove={(to) => discard(layer, to)}
                                    onCancel={() => setEmptying(null)}
                                />
                            )}

                            {shown && (
                                <ul>
                                    {standing.map((element) => (
                                        <Row
                                            key={element.id}
                                            element={element}
                                            name={elementName(
                                                element,
                                                lookup,
                                                drawing.settings.unit,
                                            )}
                                            named={isNamed(element)}
                                            chosen={chosen.has(element.id)}
                                            locked={layer.locked}
                                            renaming={renaming === element.id}
                                            onRename={() => setRenaming(element.id)}
                                            onRenamed={(label) => {
                                                setRenaming(null);
                                                runCommand(
                                                    replaceElements(
                                                        [element],
                                                        [labelled(element, label)],
                                                        'Rename',
                                                        null,
                                                    ),
                                                );
                                            }}
                                            onCancel={() => setRenaming(null)}
                                            onSelect={(add) =>
                                                select(
                                                    add
                                                        ? [
                                                              ...selection.filter(
                                                                  (id) => id !== element.id,
                                                              ),
                                                              element.id,
                                                          ]
                                                        : [element.id],
                                                )
                                            }
                                        />
                                    ))}

                                    {standing.length === 0 && (
                                        <li className="text-ink-subtle px-3 py-1 pl-9 text-[12px]">
                                            Nothing on this layer.
                                        </li>
                                    )}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>

            <button
                type="button"
                onClick={() => layersTo(addLayer(layers, ''), 'Add layer')}
                className="text-ink-muted hover:bg-sunken hover:text-ink flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px]"
            >
                <Plus className="size-3.5" />
                New layer
            </button>
        </div>
    );
}

/** A typed name goes to `metadata.label`; clearing it hands the row back to its derived one. */
function labelled(element: Element, label: string): Element {
    const trimmed = label.trim();
    const metadata = { ...element.metadata };

    if (trimmed === '') {
        delete metadata.label;
    } else {
        metadata.label = trimmed;
    }

    return { ...element, metadata };
}

interface RowProps {
    element: Element;
    name: string;
    named: boolean;
    chosen: boolean;
    locked: boolean;
    renaming: boolean;
    onRename: () => void;
    onRenamed: (label: string) => void;
    onCancel: () => void;
    onSelect: (add: boolean) => void;
}

/**
 * One element.
 *
 * Hovering writes to `interaction` and asks for a repaint rather than setting React state.
 * That is rule 5, and it is also the only way a list this long stays usable: running a pointer
 * down two hundred rows would otherwise be two hundred renders of the whole panel.
 */
function Row({
    element,
    name,
    named,
    chosen,
    locked,
    renaming,
    onRename,
    onRenamed,
    onCancel,
    onSelect,
}: RowProps) {
    function hover(id: string | null) {
        if (interaction.hoveredId !== id) {
            interaction.hoveredId = id;
            requestRepaint();
        }
    }

    if (renaming) {
        return (
            <li className="px-1.5 py-0.5 pl-9">
                <NameField
                    value={named ? name : ''}
                    label={`Rename ${name}`}
                    onCommit={onRenamed}
                    onCancel={onCancel}
                />
            </li>
        );
    }

    return (
        <li>
            <button
                type="button"
                onClick={(event) => onSelect(event.shiftKey)}
                onDoubleClick={onRename}
                onPointerEnter={() => hover(element.id)}
                onPointerLeave={() => hover(null)}
                aria-pressed={chosen}
                title={
                    locked ? `${name} — its layer is locked` : `${name} · double click to rename`
                }
                className={cn(
                    'flex w-full items-center gap-2 truncate py-0.5 pr-2 pl-9 text-left text-[12px]',
                    chosen ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-sunken',
                    locked && 'italic',
                )}
            >
                <span className="truncate">{name}</span>
            </button>
        </li>
    );
}

/**
 * What a layer's contents are offered before it goes.
 *
 * `docs/document-format.md` §3 has always said a layer is only deleted once it is empty and
 * that the interface offers to move what is on it first. This is that offer.
 */
function Emptying({
    layer,
    others,
    count,
    onMove,
    onCancel,
}: {
    layer: Layer;
    others: Layer[];
    count: number;
    onMove: (to: string) => void;
    onCancel: () => void;
}) {
    const [to, setTo] = useState(others[0]?.id ?? '');

    return (
        <div className="bg-sunken border-line space-y-1.5 border-y px-3 py-2 pl-9">
            <p className="text-ink-muted text-[12px]">
                {layer.name} holds {count} {count === 1 ? 'element' : 'elements'}. Move them where?
            </p>

            {/* Stacked rather than in a row: the panel is narrow, and three controls abreast
                left the buttons wrapping over one another. */}
            <select
                value={to}
                aria-label="Move contents to"
                onChange={(event) => setTo(event.target.value)}
                className="border-line-strong bg-surface text-ink h-6 w-full rounded-sm border px-1 text-[12px]"
            >
                {others.map((other) => (
                    <option key={other.id} value={other.id}>
                        {other.name}
                    </option>
                ))}
            </select>

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onMove(to)}
                    className="border-line-strong text-ink hover:bg-surface h-6 flex-1 rounded-sm border px-2 text-[12px]"
                >
                    Move and delete
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    className="text-ink-muted hover:text-ink h-6 shrink-0 px-1 text-[12px]"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

/** Enter commits, Escape abandons, and leaving the field commits — the same as a label. */
function NameField({
    value,
    label,
    onCommit,
    onCancel,
}: {
    value: string;
    label: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState(value);

    function key(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter') {
            onCommit(text);
        }

        if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
        }
    }

    return (
        <input
            autoFocus
            value={text}
            aria-label={label}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={key}
            onBlur={() => onCommit(text)}
            className="border-accent bg-surface text-ink h-6 w-full flex-1 rounded-sm border px-1 text-[12px]"
        />
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
                'text-ink-subtle shrink-0 rounded-sm p-0.5 transition-colors',
                disabled ? 'cursor-not-allowed opacity-30' : 'hover:text-ink',
            )}
        >
            {children}
        </button>
    );
}
