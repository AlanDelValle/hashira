import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { replaceSettings } from '@/editor/commands/command';

import { DEFAULT_LEAF_WIDTH, LEAF_OPTIONS } from '@/editor/model/openings';
import { formatLength, fromDisplay, toDisplay } from '@/editor/model/units';
import type { DisplayUnit, DoorLeaf, TitleBlock } from '@/editor/model/types';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { LayersPanel } from './LayersPanel';
import { ChoiceRow, MeasureField, ReadonlyRow } from './MeasureField';
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
            {tool === 'door' && <OpeningSettings unit={unit} />}
            {tool === 'area' && <RoomAreaSettings unit={unit} />}
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

/**
 * The thickness the next wall is drawn at.
 *
 * One value, offered wherever walls are about to be drawn — by the wall tool and by the area
 * tool, which puts four of them round a room. A setting reachable only from a tool you are not
 * using is a setting people change by accident and then wonder about.
 */
function ThicknessField({ unit }: { unit: DisplayUnit }) {
    const thickness = useEditorStore((state) => state.wallThickness);
    const setWallThickness = useEditorStore((state) => state.setWallThickness);

    return (
        <MeasureField
            label="Thickness"
            value={thickness}
            format={(value) => String(Math.round(toDisplay(value, unit) * 1000) / 1000)}
            parse={(text) => {
                const parsed = Number(text.replace(',', '.'));

                return Number.isFinite(parsed) && parsed > 0 ? fromDisplay(parsed, unit) : null;
            }}
            suffix={unit}
            onCommit={setWallThickness}
        />
    );
}

/** Shown only while the wall tool is active: the thickness the next wall will be drawn at. */
function WallSettings({ unit }: { unit: DisplayUnit }) {
    return (
        <Section title="New wall">
            <div className="px-3">
                <ThicknessField unit={unit} />
            </div>
        </Section>
    );
}

/**
 * Shown only while the door tool is active: which way the next opening will operate.
 *
 * The width is not offered here on purpose. Each kind is placed at the size it is built at,
 * and the one that matters — this garage door is 3 m, not 2.4 — is a decision about a
 * particular opening in a particular wall, which is what the properties panel is for.
 */
function OpeningSettings({ unit }: { unit: DisplayUnit }) {
    const leaf = useEditorStore((state) => state.doorLeaf);
    const setDoorLeaf = useEditorStore((state) => state.setDoorLeaf);

    return (
        <Section title="New opening">
            <div className="space-y-2 px-3">
                <ChoiceRow<DoorLeaf>
                    label="Operation"
                    value={leaf}
                    options={LEAF_OPTIONS}
                    onChange={setDoorLeaf}
                />
                <ReadonlyRow label="Width" value={formatLength(DEFAULT_LEAF_WIDTH[leaf], unit)} />
            </div>
        </Section>
    );
}

/**
 * Shown only while the area tool is active: the area the next room has to have.
 *
 * Typed before the room is placed rather than corrected afterwards, for the reason every one
 * of these panels exists: the number decides where the click goes, so it has to be on screen
 * before the click. What it decides is the *inside* of the room — the floor somebody walks on,
 * which is what an area is asked for in — and the walls are put round it at the thickness
 * below, which is the same one the wall tool draws at.
 */
function RoomAreaSettings({ unit }: { unit: DisplayUnit }) {
    const area = useEditorStore((state) => state.targetArea);
    const setTargetArea = useEditorStore((state) => state.setTargetArea);

    // Square millimetres are what the document holds; nobody types those. The factor is the
    // display unit squared, so a metre drawing reads and writes square metres.
    const factor = unit === 'm' ? 1_000_000 : unit === 'cm' ? 100 : 1;

    return (
        <Section title="New room">
            <div className="space-y-2 px-3">
                <MeasureField
                    label="Area"
                    value={area}
                    format={(value) => String(Math.round((value / factor) * 100) / 100)}
                    parse={(text) => {
                        const parsed = Number(text.replace(',', '.'));

                        return Number.isFinite(parsed) && parsed > 0 ? parsed * factor : null;
                    }}
                    suffix={`${unit}²`}
                    onCommit={setTargetArea}
                />
                {/*
                 * The same thickness the wall tool sets, because it is the same next wall —
                 * and it belongs here rather than a tool away, since it is what decides how far
                 * outside the area the four centrelines land.
                 */}
                <ThicknessField unit={unit} />
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
