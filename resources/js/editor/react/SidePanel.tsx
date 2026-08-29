import { Eye, EyeOff, Lock } from 'lucide-react';
import type { ReactNode } from 'react';

import { boundsHeight, boundsWidth } from '@/editor/geometry/bbox';
import { elementBounds, elementLength, elementSize, makeLookup } from '@/editor/model/elements';
import { formatAngle, formatLength } from '@/editor/model/units';
import type { Element } from '@/editor/model/types';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';

const TYPE_NAMES: Record<Element['type'], string> = {
    wall: 'Wall',
    line: 'Line',
    rect: 'Rectangle',
    circle: 'Circle',
    polygon: 'Polygon',
    room: 'Room',
    door: 'Door',
    window: 'Window',
    text: 'Text',
};

/**
 * What is in the drawing and what is selected.
 *
 * The values here are read-only on purpose: editing a length or an angle by typing it is the
 * properties panel, which belongs to the phase that adds walls and snapping. Showing an input
 * that does nothing would be worse than showing a number.
 */
export function SidePanel() {
    const drawing = useDocumentStore((state) => state.document);
    const selection = useEditorStore((state) => state.selection);

    const lookup = makeLookup(drawing);
    const selected = selection.flatMap((id) => {
        const element = lookup(id);

        return element === undefined ? [] : [element];
    });

    return (
        <aside aria-label="Drawing" className="bg-surface overflow-y-auto">
            <Section title="Layers">
                <ul>
                    {drawing.layers.map((layer) => (
                        <li
                            key={layer.id}
                            className="text-ink flex items-center gap-2 px-3 py-1.5 text-[13px]"
                        >
                            {layer.visible ? (
                                <Eye className="text-ink-subtle size-3.5" aria-label="Visible" />
                            ) : (
                                <EyeOff className="text-ink-subtle size-3.5" aria-label="Hidden" />
                            )}
                            <span className="flex-1">{layer.name}</span>
                            {layer.locked && (
                                <Lock className="text-ink-subtle size-3" aria-label="Locked" />
                            )}
                        </li>
                    ))}
                </ul>
            </Section>

            <Section title="Selection">
                {selected.length === 0 && (
                    <p className="text-ink-subtle px-3 text-[13px]">Nothing selected.</p>
                )}

                {selected.length === 1 && selected[0] !== undefined && (
                    <SingleSelection element={selected[0]} unit={drawing.settings.unit} />
                )}

                {selected.length > 1 && (
                    <dl className="space-y-1.5 px-3 text-[13px]">
                        <Row label="Elements" value={String(selected.length)} />
                    </dl>
                )}
            </Section>

            <Section title="Document">
                <dl className="space-y-1.5 px-3 text-[13px]">
                    <Row label="Elements" value={String(drawing.elements.length)} />
                    <Row label="Units" value={drawing.settings.unit} />
                    <Row
                        label="Grid"
                        value={formatLength(drawing.settings.grid.size, drawing.settings.unit)}
                    />
                    <Row label="Schema" value={`v${drawing.schemaVersion}`} />
                </dl>
            </Section>
        </aside>
    );
}

function SingleSelection({ element, unit }: { element: Element; unit: 'mm' | 'cm' | 'm' }) {
    const lookup = makeLookup(useDocumentStore.getState().document);
    const length = elementLength(element);
    // The element's own size when it has one, falling back to its extent when it does not.
    const size = elementSize(element) ?? boundsSize(elementBounds(element, lookup));

    return (
        <dl className="space-y-1.5 px-3 text-[13px]">
            <Row label="Type" value={TYPE_NAMES[element.type]} />
            <Row label="X" value={formatLength(element.transform.x, unit)} />
            <Row label="Y" value={formatLength(element.transform.y, unit)} />

            {length !== null && <Row label="Length" value={formatLength(length, unit)} />}

            {length === null && size !== null && (
                <>
                    <Row label="Width" value={formatLength(size.width, unit)} />
                    <Row label="Height" value={formatLength(size.height, unit)} />
                </>
            )}

            <Row label="Rotation" value={formatAngle(element.transform.rotation)} />
        </dl>
    );
}

function boundsSize(bounds: ReturnType<typeof elementBounds>) {
    return bounds === null ? null : { width: boundsWidth(bounds), height: boundsHeight(bounds) };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-line border-b py-2.5">
            <h2 className="text-ink-subtle px-3 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-ink font-mono">{value}</dd>
        </div>
    );
}
