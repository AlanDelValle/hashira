import type { ReactNode } from 'react';

import { fromDisplay, toDisplay } from '@/editor/model/units';
import type { DisplayUnit } from '@/editor/model/types';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

import { LayersPanel } from './LayersPanel';
import { MeasureField } from './MeasureField';
import { PropertiesPanel } from './PropertiesPanel';

/**
 * The right-hand column: what the active tool is about to do, what is selected, and the layers
 * the drawing is organised into.
 */
export function SidePanel() {
    const unit = useDocumentStore((state) => state.document.settings.unit);
    const elementCount = useDocumentStore((state) => state.document.elements.length);
    const tool = useEditorStore((state) => state.tool);

    return (
        <aside aria-label="Drawing" className="bg-surface overflow-y-auto">
            {tool === 'wall' && <WallSettings unit={unit} />}

            <Section title="Properties">
                <PropertiesPanel />
            </Section>

            <Section title="Layers" inset>
                <LayersPanel />
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
