import { Copy, Crosshair, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { replaceSheets } from '@/editor/commands/command';
import { layoutSheet, sheetInWorld, STANDARD_SCALES } from '@/editor/export/sheet';
import type { Bounds } from '@/editor/geometry/bbox';
import { documentIndex } from '@/editor/model/documentIndex';
import { createSheet, duplicateSheet, resolveSheet } from '@/editor/model/sheets';
import type { Sheet, SheetOrientation, SheetSize } from '@/editor/model/types';
import { formatLengthValue, formatScale, parseLength } from '@/editor/model/units';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { visibleBounds } from '@/editor/viewport/viewport';
import { cn } from '@/lib/cn';

import { ChoiceRow, MeasureField, ReadonlyRow } from './MeasureField';

/**
 * The pages the drawing prints on.
 *
 * A sheet is paper rather than drawing, so nothing here creates geometry — it decides how big
 * the page is, what ratio it is plotted at, and which part of the plan it looks at. All of
 * that lives in the document and goes through a command, because deleting a page throws away
 * a decision about how the drawing is presented. Which sheet is *active* does not: that is
 * about the person editing, like the active layer.
 *
 * A sheet is placed by pointing the view at what it should show and saying so, rather than by
 * dragging a rectangle around: the view is already the thing being aimed, and a page nudged
 * into position by eye at 4% zoom is not positioned.
 */
export function SheetsPanel() {
    const drawing = useDocumentStore((state) => state.document);
    const activeSheetId = useEditorStore((state) => state.activeSheetId);
    const setActiveSheet = useEditorStore((state) => state.setActiveSheet);
    const sheetFrameVisible = useEditorStore((state) => state.sheetFrameVisible);
    const toggleSheetFrame = useEditorStore((state) => state.toggleSheetFrame);

    const sheets = drawing.settings.sheets;
    const unit = drawing.settings.unit;
    const active = resolveSheet(sheets, activeSheetId);
    const extent = documentIndex(drawing).extent();

    function update(next: Sheet[], label: string): void {
        runCommand(replaceSheets(sheets, next, label));
    }

    function edit(changes: Partial<Sheet>, label: string): void {
        if (active === undefined) return;

        update(
            sheets.map((sheet) => (sheet.id === active.id ? { ...sheet, ...changes } : sheet)),
            label,
        );
    }

    function add(created: Sheet): void {
        update([...sheets, created], 'Add sheet');
        setActiveSheet(created.id);
    }

    function remove(sheet: Sheet): void {
        // A drawing with no page has nowhere to print and nothing for this panel to edit, so
        // the last sheet stays rather than the deletion being explained away afterwards.
        if (sheets.length < 2) return;

        update(
            sheets.filter((current) => current.id !== sheet.id),
            'Delete sheet',
        );
    }

    /** Put the sheet over whatever the canvas is currently showing. */
    function placeOnView(): void {
        const { viewport, size } = useViewportStore.getState();

        if (size.width === 0 || size.height === 0) return;

        const visible = visibleBounds(viewport, size);

        edit(
            {
                centre: {
                    x: (visible.minX + visible.maxX) / 2,
                    y: (visible.minY + visible.maxY) / 2,
                },
            },
            'Place sheet',
        );
    }

    /** Point the canvas at the sheet, which is the same act the other way round. */
    function zoomToSheet(): void {
        if (active === undefined) return;

        useViewportStore.getState().fit(sheetInWorld(layoutSheet(framed(extent), active)).page);
    }

    return (
        <div className="flex flex-col gap-2">
            <ul>
                {sheets.map((sheet) => (
                    <li key={sheet.id} className="group flex items-center gap-1 px-2">
                        <button
                            type="button"
                            onClick={() => setActiveSheet(sheet.id)}
                            aria-pressed={sheet.id === active?.id}
                            title={`Work on ${sheet.name}`}
                            className={cn(
                                'flex-1 truncate rounded-sm px-1 py-1 text-left text-[13px]',
                                sheet.id === active?.id ? 'text-accent font-medium' : 'text-ink',
                            )}
                        >
                            {sheet.name}
                            <span className="text-ink-subtle ml-2 font-mono text-[11px]">
                                {sheet.size} · {formatScale(printedScale(sheet, extent))}
                            </span>
                        </button>

                        <IconButton
                            label={`Duplicate ${sheet.name}`}
                            onClick={() => add(duplicateSheet(sheet, sheets))}
                        >
                            <Copy className="size-3" />
                        </IconButton>

                        <IconButton
                            label={`Delete ${sheet.name}`}
                            disabled={sheets.length < 2}
                            onClick={() => remove(sheet)}
                        >
                            <Trash2 className="size-3" />
                        </IconButton>
                    </li>
                ))}
            </ul>

            <div className="px-3">
                <button
                    type="button"
                    onClick={() =>
                        add(
                            createSheet(sheets, {
                                scale: active?.scale ?? drawing.settings.scale,
                                ...(active === undefined
                                    ? {}
                                    : { size: active.size, orientation: active.orientation }),
                            }),
                        )
                    }
                    className="text-ink-muted hover:text-ink hover:border-ink-subtle border-line-strong flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed py-1 text-[12px] transition-colors"
                >
                    <Plus className="size-3" aria-hidden />
                    Add sheet
                </button>
            </div>

            {active !== undefined && (
                <div className="flex flex-col gap-1.5 px-3 pt-1">
                    <NameRow
                        value={active.name}
                        onCommit={(name) => edit({ name }, 'Rename sheet')}
                    />

                    <ChoiceRow<SheetSize>
                        label="Size"
                        value={active.size}
                        options={SIZES.map((size) => ({ value: size, label: size }))}
                        onChange={(size) => edit({ size }, 'Sheet size')}
                    />

                    <ChoiceRow<SheetOrientation>
                        label="Orientation"
                        value={active.orientation}
                        options={[
                            { value: 'landscape', label: 'Landscape' },
                            { value: 'portrait', label: 'Portrait' },
                        ]}
                        onChange={(orientation) => edit({ orientation }, 'Sheet orientation')}
                    />

                    <ChoiceRow
                        label="Scale"
                        value={String(active.scale)}
                        options={STANDARD_SCALES.map((scale) => ({
                            value: String(scale),
                            label: formatScale(scale),
                        }))}
                        onChange={(value) => edit({ scale: Number(value) }, 'Sheet scale')}
                    />

                    {active.centre === null ? (
                        <>
                            <ReadonlyRow label="Shows" value="The whole drawing" />

                            {/*
                             * A sheet framing everything cannot hold a ratio the drawing has
                             * outgrown, so the scale steps up until it fits. Saying so here is
                             * the difference between choosing 1:50 and being handed 1:100 with
                             * no explanation.
                             */}
                            {printedScale(active, extent) !== active.scale && (
                                <ReadonlyRow
                                    label="Prints at"
                                    value={formatScale(printedScale(active, extent))}
                                />
                            )}
                        </>
                    ) : (
                        <>
                            <MeasureField
                                label="Centre X"
                                value={active.centre.x}
                                format={(value) => formatLengthValue(value, unit)}
                                parse={(text) => parseLength(text, unit)}
                                suffix={unit}
                                onCommit={(x) =>
                                    edit({ centre: { x, y: centreOf(active).y } }, 'Move sheet')
                                }
                            />

                            <MeasureField
                                label="Centre Y"
                                value={active.centre.y}
                                format={(value) => formatLengthValue(value, unit)}
                                parse={(text) => parseLength(text, unit)}
                                suffix={unit}
                                onCommit={(y) =>
                                    edit({ centre: { x: centreOf(active).x, y } }, 'Move sheet')
                                }
                            />
                        </>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                        <SmallButton onClick={placeOnView}>Place on view</SmallButton>

                        {active.centre !== null && (
                            <SmallButton
                                onClick={() => edit({ centre: null }, 'Frame the drawing')}
                            >
                                Frame all
                            </SmallButton>
                        )}

                        {/*
                         * Available whether or not the sheet has been placed: a page framing
                         * the whole drawing is a good deal larger than the drawing, so its
                         * outline is usually off screen too.
                         */}
                        <SmallButton onClick={zoomToSheet}>
                            <Crosshair className="size-3" aria-hidden />
                            Show
                        </SmallButton>

                        <SmallButton onClick={toggleSheetFrame} pressed={sheetFrameVisible}>
                            Outline
                        </SmallButton>
                    </div>
                </div>
            )}
        </div>
    );
}

const SIZES: SheetSize[] = ['A4', 'A3', 'A2', 'A1'];

/** An empty drawing still has to lay a page out somewhere. */
function framed(extent: Bounds | null): Bounds {
    return extent ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
}

/** What a sheet will actually be plotted at, which is not always what it was set to. */
function printedScale(sheet: Sheet, extent: Bounds | null): number {
    return layoutSheet(framed(extent), sheet).scale;
}

function centreOf(sheet: Sheet): { x: number; y: number } {
    return sheet.centre ?? { x: 0, y: 0 };
}

/**
 * The sheet's name, typed. Like a measure field, it keeps a draft while it is focused and
 * commits on Enter or blur — a rename is a command, and one per keystroke would bury the
 * history under thirty of them.
 */
function NameRow({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
    const id = useId();
    const [draft, setDraft] = useState(value);
    const focused = useRef(false);

    useEffect(() => {
        if (!focused.current) {
            setDraft(value);
        }
    }, [value]);

    function commit() {
        const trimmed = draft.trim();

        if (trimmed === '' || trimmed === value) {
            setDraft(value);

            return;
        }

        onCommit(trimmed);
    }

    return (
        <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="text-ink-muted text-[13px]">
                Name
            </label>
            <input
                id={id}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => {
                    focused.current = true;
                }}
                onBlur={() => {
                    focused.current = false;
                    commit();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();

                    if (event.key === 'Escape') {
                        setDraft(value);
                        event.currentTarget.blur();
                    }
                }}
                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent h-6 w-24 rounded-sm border px-1.5 text-[12px] transition-colors"
            />
        </div>
    );
}

function SmallButton({
    onClick,
    pressed,
    children,
}: {
    onClick: () => void;
    pressed?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
            className={cn(
                'border-line-strong flex items-center gap-1 rounded-sm border px-2 py-1 text-[12px] transition-colors',
                pressed === true
                    ? 'border-accent text-accent'
                    : 'text-ink-muted hover:text-ink hover:border-ink-subtle',
            )}
        >
            {children}
        </button>
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
                disabled
                    ? 'cursor-not-allowed opacity-30'
                    : 'hover:text-ink opacity-0 group-hover:opacity-100',
            )}
        >
            {children}
        </button>
    );
}
