import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { replaceSettings } from '@/editor/commands/command';

import { fromDisplay, toDisplay } from '@/editor/model/units';
import type { DisplayUnit, TitleBlock } from '@/editor/model/types';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { LayersPanel } from './LayersPanel';
import { MeasureField } from './MeasureField';
import { PropertiesPanel } from './PropertiesPanel';
import { SheetsPanel } from './SheetsPanel';

/**
 * The right-hand column: what the active tool is about to do, what is selected, the layers the
 * drawing is organised into, and the pages it prints on.
 */
export function SidePanel() {
    const unit = useDocumentStore((state) => state.document.settings.unit);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const tool = useEditorStore((state) => state.tool);

    return (
        <aside aria-label="Drawing" className="bg-surface h-full overflow-y-auto">
            {tool === 'wall' && <WallSettings unit={unit} />}
            {tool === 'text' && <TextSettings unit={unit} />}
            {tool === 'dimension' && <DimensionSettings unit={unit} />}
            {tool === 'cloud' && <CloudSettings unit={unit} />}

            <Section title="Properties">
                <PropertiesPanel />
            </Section>

            <Section title="Layers" inset>
                <LayersPanel />
            </Section>

            <Section title="Sheets" inset>
                <SheetsPanel />
            </Section>

            <Section title="Title block">
                <TitleBlockFields />
            </Section>

            <Section title="Notes">
                <NotesField />
            </Section>

            <Section title="Document">
                <div className="text-ink-muted flex justify-between px-3 text-[13px]">
                    <span>Elements</span>
                    <span className="text-ink font-mono">{elementCount}</span>
                </div>
            </Section>
        </aside>
    );
}

/** Shown only while the wall tool is active: the thickness the next wall will be drawn at. */
function WallSettings({ unit }: { unit: DisplayUnit }) {
    const thickness = useEditorStore((state) => state.wallThickness);
    const setWallThickness = useEditorStore((state) => state.setWallThickness);

    return (
        <Section title="New wall">
            <div className="px-3">
                <MeasureField
                    label="Thickness"
                    value={thickness}
                    format={(value) => String(Math.round(toDisplay(value, unit) * 1000) / 1000)}
                    parse={(text) => {
                        const parsed = Number(text.replace(',', '.'));

                        return Number.isFinite(parsed) && parsed > 0
                            ? fromDisplay(parsed, unit)
                            : null;
                    }}
                    suffix={unit}
                    onCommit={setWallThickness}
                />
            </div>
        </Section>
    );
}

/** Shown only while the dimension tool is active: the size the next value will be written at. */
function DimensionSettings({ unit }: { unit: DisplayUnit }) {
    const size = useEditorStore((state) => state.dimensionSize);
    const setDimensionSize = useEditorStore((state) => state.setDimensionSize);

    return (
        <Section title="New dimension">
            <div className="px-3">
                <MeasureField
                    label="Size"
                    value={size}
                    format={(value) => String(Math.round(toDisplay(value, unit) * 1000) / 1000)}
                    parse={(text) => {
                        const parsed = Number(text.replace(',', '.'));

                        return Number.isFinite(parsed) && parsed > 0
                            ? fromDisplay(parsed, unit)
                            : null;
                    }}
                    suffix={unit}
                    onCommit={setDimensionSize}
                />
            </div>
        </Section>
    );
}

const TITLE_BLOCK_FIELDS: { key: keyof TitleBlock; label: string; hint: string }[] = [
    { key: 'project', label: 'Project', hint: '' },
    { key: 'client', label: 'Client', hint: '' },
    { key: 'drawnBy', label: 'Drawn by', hint: '' },
    { key: 'revision', label: 'Revision', hint: '' },
    { key: 'date', label: 'Date', hint: 'Today, if left empty' },
];

/**
 * What the print says beyond the drawing's name.
 *
 * These are facts about the job rather than about the page, so they live on the document and
 * appear on every sheet of it. An empty field is not printed at all — a title block with
 * "Client:" and nothing after it says less than no line at all.
 */
function TitleBlockFields() {
    const settings = useDocumentStore((state) => state.document.settings);

    function set(key: keyof TitleBlock, value: string): void {
        if (settings.titleBlock[key] === value) return;

        runCommand(
            replaceSettings(
                settings,
                { ...settings, titleBlock: { ...settings.titleBlock, [key]: value } },
                'Title block',
            ),
        );
    }

    return (
        <div className="flex flex-col gap-1.5 px-3">
            {TITLE_BLOCK_FIELDS.map((field) => (
                <TextRow
                    key={field.key}
                    label={field.label}
                    placeholder={field.hint}
                    value={settings.titleBlock[field.key]}
                    onCommit={(value) => set(field.key, value)}
                />
            ))}
        </div>
    );
}

/**
 * What the sheet says in words, printed in the strip beside the drawing.
 *
 * One note to a line, because a line is the only unit somebody typing here can see, and the
 * print numbers them on exactly that basis. Notes are a property of the drawing rather than of
 * a page, like the title block: a set of sheets that disagreed about the same instruction would
 * be a set nobody could build from.
 *
 * The strip is paid for out of the drawing area, so the first note typed narrows the page's
 * frame — visible immediately, because the sheet outline on the canvas is laid out by the same
 * function that lays out the print.
 */
function NotesField() {
    const settings = useDocumentStore((state) => state.document.settings);
    const [draft, setDraft] = useState(settings.notes);
    const focused = useRef(false);

    useEffect(() => {
        if (!focused.current) {
            setDraft(settings.notes);
        }
    }, [settings.notes]);

    function commit(value: string): void {
        if (settings.notes === value) return;

        runCommand(replaceSettings(settings, { ...settings, notes: value }, 'Notes'));
    }

    return (
        <div className="px-3">
            <textarea
                aria-label="Notes"
                rows={4}
                value={draft}
                placeholder="One note to a line"
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => {
                    focused.current = true;
                }}
                onBlur={(event) => {
                    focused.current = false;
                    commit(event.target.value.trim());
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setDraft(settings.notes);
                        event.currentTarget.blur();
                    }
                }}
                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent placeholder:text-ink-subtle w-full resize-y rounded-sm border px-1.5 py-1 text-[12px] transition-colors"
            />
        </div>
    );
}

/** A line of the title block, kept as a draft while it is typed and committed on the way out. */
function TextRow({
    label,
    value,
    placeholder,
    onCommit,
}: {
    label: string;
    value: string;
    placeholder?: string;
    onCommit: (value: string) => void;
}) {
    const id = useId();
    const [draft, setDraft] = useState(value);
    const focused = useRef(false);

    useEffect(() => {
        if (!focused.current) {
            setDraft(value);
        }
    }, [value]);

    return (
        <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="text-ink-muted text-[13px]">
                {label}
            </label>
            <input
                id={id}
                value={draft}
                placeholder={placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => {
                    focused.current = true;
                }}
                onBlur={() => {
                    focused.current = false;
                    onCommit(draft.trim());
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();

                    if (event.key === 'Escape') {
                        setDraft(value);
                        event.currentTarget.blur();
                    }
                }}
                className="border-line-strong bg-surface text-ink hover:border-ink-subtle focus:border-accent placeholder:text-ink-subtle h-6 w-32 rounded-sm border px-1.5 text-[12px] transition-colors"
            />
        </div>
    );
}

/** Shown only while the cloud tool is active: how big the next cloud's bumps will be. */
function CloudSettings({ unit }: { unit: DisplayUnit }) {
    const radius = useEditorStore((state) => state.cloudRadius);
    const setCloudRadius = useEditorStore((state) => state.setCloudRadius);

    return (
        <Section title="New revision cloud">
            <div className="px-3">
                <MeasureField
                    label="Bump"
                    value={radius}
                    format={(value) => String(Math.round(toDisplay(value, unit) * 1000) / 1000)}
                    parse={(text) => {
                        const parsed = Number(text.replace(',', '.'));

                        return Number.isFinite(parsed) && parsed > 0
                            ? fromDisplay(parsed, unit)
                            : null;
                    }}
                    suffix={unit}
                    onCommit={setCloudRadius}
                />
            </div>
        </Section>
    );
}

/** Shown only while the text tool is active: the size the next label will be written at. */
function TextSettings({ unit }: { unit: DisplayUnit }) {
    const size = useEditorStore((state) => state.textSize);
    const setTextSize = useEditorStore((state) => state.setTextSize);

    return (
        <Section title="New text">
            <div className="px-3">
                <MeasureField
                    label="Size"
                    value={size}
                    format={(value) => String(Math.round(toDisplay(value, unit) * 1000) / 1000)}
                    parse={(text) => {
                        const parsed = Number(text.replace(',', '.'));

                        return Number.isFinite(parsed) && parsed > 0
                            ? fromDisplay(parsed, unit)
                            : null;
                    }}
                    suffix={unit}
                    onCommit={setTextSize}
                />
            </div>
        </Section>
    );
}

function Section({
    title,
    children,
    inset = false,
}: {
    title: string;
    children: ReactNode;
    inset?: boolean;
}) {
    return (
        <section className="border-line border-b py-2.5">
            <h2 className="text-ink-subtle px-3 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
                {title}
            </h2>
            {inset ? children : <div>{children}</div>}
        </section>
    );
}
