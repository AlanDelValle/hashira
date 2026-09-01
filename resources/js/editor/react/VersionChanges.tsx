import type {
    ChangeKind,
    DocumentDiff,
    ElementChange,
    LayerChange,
    SettingsChange,
} from '@/editor/model/diff';
import { elementFieldLabel, layerFieldLabel, settingsFieldLabel } from '@/editor/model/diff';
import { ELEMENT_TYPE_NAMES } from '@/editor/model/elements';
import type { Layer } from '@/editor/model/types';
import { formatScale } from '@/editor/model/units';
import { cn } from '@/lib/cn';

/**
 * What changed, as words.
 *
 * The drawing beside this says the same thing as a redline, and neither is a substitute for
 * the other: a mark on a plan is how you see *where*, a list is how you see *what* — and it is
 * the list that a keyboard reaches and a screen reader reads. Each row carries a sign as well
 * as a colour for the same reason the marks are dashed as well as coloured.
 */

const MARKERS: Record<ChangeKind, { sign: string; tone: string; word: string }> = {
    added: { sign: '+', tone: 'text-positive', word: 'Drawn' },
    changed: { sign: '~', tone: 'text-caution', word: 'Edited' },
    removed: { sign: '−', tone: 'text-danger', word: 'Deleted' },
};

const ORDER: ChangeKind[] = ['added', 'changed', 'removed'];

export function VersionChanges({
    diff,
    layers,
    onPick,
}: {
    diff: DocumentDiff;
    /** The later version's layers, for naming the one an element sits on. */
    layers: readonly Layer[];
    onPick: (change: ElementChange) => void;
}) {
    const layerNames = new Map(layers.map((layer) => [layer.id, layer.name]));
    const also = otherChanges(diff);

    if (diff.empty) {
        return (
            <p className="text-ink-subtle py-6 text-center text-[13px]">
                These two versions are identical.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {ORDER.map((kind) => {
                const changes = diff.elements.filter((change) => change.kind === kind);

                if (changes.length === 0) {
                    return null;
                }

                return (
                    <section key={kind}>
                        <h3 className="text-ink-subtle text-[11px] font-medium tracking-wide uppercase">
                            {MARKERS[kind].word} · {changes.length}
                        </h3>

                        <ul className="mt-1">
                            {changes.map((change) => (
                                <li key={`${kind}-${change.id}`}>
                                    <ChangeRow
                                        change={change}
                                        layerName={layerNames.get(change.layerId) ?? 'No layer'}
                                        onPick={onPick}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}

            {also.length > 0 && (
                <section>
                    <h3 className="text-ink-subtle text-[11px] font-medium tracking-wide uppercase">
                        Elsewhere · {also.length}
                    </h3>

                    <ul className="mt-1">
                        {also.map((line) => (
                            <li
                                key={line.key}
                                className="flex items-baseline gap-2 py-1 text-[13px]"
                            >
                                <span
                                    aria-hidden
                                    className={cn('w-2 font-mono', MARKERS[line.kind].tone)}
                                >
                                    {MARKERS[line.kind].sign}
                                </span>
                                <span className="text-ink-muted">{line.text}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function ChangeRow({
    change,
    layerName,
    onPick,
}: {
    change: ElementChange;
    layerName: string;
    onPick: (change: ElementChange) => void;
}) {
    const marker = MARKERS[change.kind];
    const fields = change.fields.map(elementFieldLabel).join(', ');

    return (
        <button
            type="button"
            onClick={() => onPick(change)}
            className="hover:bg-sunken flex w-full items-baseline gap-2 rounded-sm px-1 py-1 text-left text-[13px]"
        >
            <span aria-hidden className={cn('w-2 shrink-0 font-mono', marker.tone)}>
                {marker.sign}
            </span>

            <span className="text-ink shrink-0">{ELEMENT_TYPE_NAMES[change.type]}</span>
            <span className="text-ink-subtle min-w-0 truncate">{layerName}</span>

            {fields !== '' && <span className="text-ink-subtle ml-auto shrink-0">{fields}</span>}

            {/* The sign is decoration; this is the same fact said in words. */}
            <span className="sr-only">
                {marker.word}
                {fields === '' ? '' : `: ${fields}`}
            </span>
        </button>
    );
}

interface OtherChange {
    key: string;
    kind: ChangeKind;
    text: string;
}

/** Everything a comparison found that is not an element: layers, settings, the name, the order. */
function otherChanges(diff: DocumentDiff): OtherChange[] {
    const lines: OtherChange[] = [];

    if (diff.name !== null) {
        lines.push({
            key: 'name',
            kind: 'changed',
            text: `Renamed from "${diff.name.before}" to "${diff.name.after}"`,
        });
    }

    for (const layer of diff.layers) {
        lines.push({
            key: `layer-${layer.id}`,
            kind: layer.kind,
            text: describeLayer(layer),
        });
    }

    for (const setting of diff.settings) {
        lines.push({
            key: `setting-${setting.key}`,
            kind: 'changed',
            text: describeSetting(setting),
        });
    }

    if (diff.reordered) {
        lines.push({
            key: 'order',
            kind: 'changed',
            // Worth saying out loud: nothing was edited, and the drawing still looks different.
            text: 'Paint order changed — elements overlap differently',
        });
    }

    return lines;
}

function describeLayer(change: LayerChange): string {
    if (change.kind === 'added') {
        return `Layer "${change.name}" added`;
    }

    if (change.kind === 'removed') {
        return `Layer "${change.name}" deleted`;
    }

    return `Layer "${change.name}": ${change.fields.map(layerFieldLabel).join(', ')}`;
}

function describeSetting(change: SettingsChange): string {
    const label = settingsFieldLabel(change.key);

    if (change.key === 'scale') {
        return `Drawing scale ${formatScale(Number(change.before))} → ${formatScale(Number(change.after))}`;
    }

    // Only the settings that are a single value can be shown as one; a grid or a set of sheets
    // is a shape, and "grid changed" is more use than a paragraph of JSON.
    if (isScalar(change.before) && isScalar(change.after)) {
        return `${sentenceCase(label)} ${String(change.before)} → ${String(change.after)}`;
    }

    return `${sentenceCase(label)} changed`;
}

function isScalar(value: unknown): value is string | number {
    return (typeof value === 'string' && value !== '') || typeof value === 'number';
}

function sentenceCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
