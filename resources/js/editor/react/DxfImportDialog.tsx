import { useRef, useState } from 'react';

import { addElements, combine, replaceLayers } from '@/editor/commands/command';
import { unionBounds, type Bounds } from '@/editor/geometry/bbox';
import {
    dxfElements,
    readDxf,
    DXF_UNITS,
    MAX_IMPORT_ELEMENTS,
    type DxfDrawing,
    type DxfUnit,
} from '@/editor/interchange/dxfImport';
import { elementBounds, makeLookup } from '@/editor/model/elements';
import { newId } from '@/editor/model/id';
import type { Element, Layer } from '@/editor/model/types';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

/**
 * Bringing a DXF in.
 *
 * Reading the file is the easy half. The hard half is that a DXF says almost nothing about
 * itself: it may not state its units, it carries far more than a plan usually wants, and none
 * of it is walls. So the file is read in the browser first and its contents are put to the
 * person — how big it thinks it is, what is on each layer, what could not come — and nothing
 * is added to the drawing until they have looked at it.
 *
 * The ceiling is not squeamishness. A drawing is one JSON document saved whole on every
 * autosave, so an import that brought a quarter of a million survey entities would produce a
 * plan that cannot be saved. Being told the number beforehand is better than finding out.
 */
export function DxfImportDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Import a DXF"
            description="What comes in is shapes on layers. Nothing in a DXF says which lines are a wall, so nothing becomes one."
            size="lg"
        >
            {/* Unmounted with the dialog, so each opening starts from no file at all. */}
            <ImportForm onOpenChange={onOpenChange} />
        </Modal>
    );
}

const UNIT_LABELS: Record<DxfUnit, string> = {
    mm: 'Millimetres',
    cm: 'Centimetres',
    m: 'Metres',
    inch: 'Inches',
    foot: 'Feet',
};

function ImportForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const layers = useDocumentStore((state) => state.document.layers);

    const [drawing, setDrawing] = useState<DxfDrawing | null>(null);
    const [name, setName] = useState('');
    const [unit, setUnit] = useState<DxfUnit>('mm');
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const file = useRef<HTMLInputElement>(null);

    async function pick(picked: File): Promise<void> {
        setError(null);

        const result = readDxf(await picked.text());

        if (!result.ok) {
            setDrawing(null);
            setError(result.reason);

            return;
        }

        setDrawing(result.drawing);
        setName(picked.name);
        // What the file says, when it says anything. Millimetres otherwise, which is what the
        // drawing is in — and the wrong guess is one select away rather than a re-import.
        setUnit(result.drawing.unit ?? 'mm');
        setChosen(new Set(result.drawing.layers.map((layer) => layer.name)));
    }

    const counted =
        drawing === null
            ? 0
            : drawing.layers
                  .filter((layer) => chosen.has(layer.name))
                  .reduce((all, layer) => all + layer.count, 0);

    const tooMuch = counted > MAX_IMPORT_ELEMENTS;

    function toggle(layer: string): void {
        setChosen((current) => {
            const next = new Set(current);

            if (!next.delete(layer)) next.add(layer);

            return next;
        });
    }

    function bringItIn(): void {
        if (drawing === null || counted === 0 || tooMuch) return;

        /*
         * A DXF layer lands on the drawing's layer of the same name when there is one, and on
         * a new layer otherwise. Matching by name is what makes importing a revised file twice
         * put its walls back where its walls were.
         */
        const byName = new Map(layers.map((layer) => [layer.name.toLowerCase(), layer]));
        const added: Layer[] = [];
        const target = new Map<string, string>();

        for (const layer of drawing.layers) {
            if (!chosen.has(layer.name)) continue;

            const existing = byName.get(layer.name.toLowerCase());

            if (existing !== undefined) {
                target.set(layer.name, existing.id);
                continue;
            }

            const created: Layer = {
                id: newId(),
                name: layer.name,
                color: layer.color,
                visible: layer.visible,
                locked: false,
                order: layers.length + added.length,
            };

            added.push(created);
            target.set(layer.name, created.id);
        }

        const elements = dxfElements(drawing.shapes, {
            unitScale: DXF_UNITS[unit],
            layers: target,
        });

        if (elements.length === 0) {
            setError('Nothing on the chosen layers could be brought in.');

            return;
        }

        runCommand(
            combine(`Import ${name}`, [
                ...(added.length > 0
                    ? [replaceLayers(layers, [...layers, ...added], 'Layers')]
                    : []),
                addElements(elements, 'Imported drawing'),
            ]),
        );

        const framed = boundsOf(elements);

        if (framed !== null) {
            useViewportStore.getState().fit(framed);
        }

        onOpenChange(false);
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <input
                    ref={file}
                    type="file"
                    accept=".dxf,application/dxf,image/vnd.dxf"
                    className="sr-only"
                    onChange={(event) => {
                        const picked = event.target.files?.[0];

                        if (picked !== undefined) void pick(picked);
                    }}
                />

                <div className="flex items-center gap-3">
                    <Button onClick={() => file.current?.click()}>Choose a file</Button>
                    <span className="text-ink-subtle truncate text-[13px]">
                        {name === '' ? 'No file chosen' : name}
                    </span>
                </div>
            </div>

            {error !== null && (
                <p role="alert" className="text-danger text-[13px]">
                    {error}
                </p>
            )}

            {drawing !== null && (
                <>
                    <div className="flex items-center justify-between gap-3">
                        <label htmlFor="dxf-unit" className="text-ink-muted text-[13px]">
                            A unit in the file is
                        </label>
                        <select
                            id="dxf-unit"
                            value={unit}
                            onChange={(event) => setUnit(event.target.value as DxfUnit)}
                            className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-7 rounded-sm border px-1.5 text-[13px] transition-colors"
                        >
                            {(Object.keys(UNIT_LABELS) as DxfUnit[]).map((each) => (
                                <option key={each} value={each}>
                                    {UNIT_LABELS[each]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <p className="text-ink-subtle -mt-3 text-[12px]">
                        {drawing.unit === null
                            ? 'The file does not say what its units are, so this is a guess worth checking.'
                            : `The file says ${UNIT_LABELS[drawing.unit].toLowerCase()}.`}
                    </p>

                    <fieldset>
                        <legend className="text-ink-subtle pb-2 text-[11px] font-medium tracking-wide uppercase">
                            Layers
                        </legend>

                        <ul className="border-line divide-line max-h-56 divide-y overflow-y-auto rounded-md border">
                            {drawing.layers.map((layer) => (
                                <li key={layer.name}>
                                    <label className="hover:bg-sunken flex cursor-pointer items-center gap-2.5 px-3 py-1.5">
                                        <input
                                            type="checkbox"
                                            checked={chosen.has(layer.name)}
                                            onChange={() => toggle(layer.name)}
                                            className="accent-accent size-3.5"
                                        />
                                        <span
                                            aria-hidden
                                            className="size-2.5 shrink-0 rounded-xs"
                                            style={{ backgroundColor: layer.color }}
                                        />
                                        <span className="text-ink flex-1 truncate text-[13px]">
                                            {layer.name}
                                        </span>
                                        {!layer.visible && (
                                            <span className="text-ink-subtle text-[11px]">
                                                off in the file
                                            </span>
                                        )}
                                        <span className="text-ink-subtle font-mono text-[11px]">
                                            {layer.count}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </fieldset>

                    {drawing.skipped.length > 0 && (
                        <p className="text-ink-subtle text-[12px]">
                            Not coming:{' '}
                            {drawing.skipped
                                .map((each) => `${each.count} ${each.type.toLowerCase()}`)
                                .join(', ')}
                            . This reads shapes; hatching, images and anything it does not recognise
                            stay behind.
                        </p>
                    )}
                </>
            )}

            <div className="flex items-center justify-between gap-3">
                <span
                    className={tooMuch ? 'text-danger text-[12px]' : 'text-ink-subtle text-[12px]'}
                >
                    {drawing === null
                        ? ''
                        : tooMuch
                          ? `${counted.toLocaleString()} shapes is more than a drawing can carry. Bring fewer layers — the ceiling is ${MAX_IMPORT_ELEMENTS.toLocaleString()}.`
                          : `${counted.toLocaleString()} ${counted === 1 ? 'shape' : 'shapes'}`}
                </span>

                <div className="flex shrink-0 gap-2">
                    <Button onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={drawing === null || counted === 0 || tooMuch}
                        onClick={bringItIn}
                    >
                        Import
                    </Button>
                </div>
            </div>
        </div>
    );
}

function boundsOf(elements: readonly Element[]): Bounds | null {
    const lookup = makeLookup(elements);

    return elements.reduce<Bounds | null>(
        (all, element) => unionBounds(all, elementBounds(element, lookup)),
        null,
    );
}
