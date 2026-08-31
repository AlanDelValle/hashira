import { useRef, useState } from 'react';

import {
    blockFromSelection,
    draftDefinition,
    type BlockDraft,
} from '@/editor/assets/fromSelection';
import { ASSET_CATEGORIES, type AssetCategory } from '@/editor/assets/library';
import { importSvg } from '@/editor/assets/svgImport';
import { makeLookup } from '@/editor/model/elements';
import { formatLength } from '@/editor/model/units';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import type { NewBlock } from '@/projects/useBlocks';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextField } from '@/ui/TextField';

import { AssetThumbnail } from './AssetThumbnail';

/**
 * Making a block.
 *
 * Two ways in, because there are two ways a block comes about: something already drawn on
 * this sheet, or a drawing made somewhere else. Both end in the same place — a normalised
 * drawing, a size and a name — which is why the dialog shows the same preview whichever was
 * used. What you are looking at before you press Save is the block.
 */
export function NewBlockDialog({
    open,
    onOpenChange,
    onCreate,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (block: NewBlock) => Promise<unknown>;
}) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="New block"
            description="Make a block from what is selected on the sheet, or from an SVG drawing."
        >
            {/*
             * The form is its own component, and the dialog unmounts it on the way out — so
             * each opening starts clean without anything having to remember to clear it. A
             * half-filled dialog from last time is a block waiting to be saved under the
             * wrong name.
             */}
            <NewBlockForm onOpenChange={onOpenChange} onCreate={onCreate} />
        </Modal>
    );
}

function NewBlockForm({
    onOpenChange,
    onCreate,
}: {
    onOpenChange: (open: boolean) => void;
    onCreate: (block: NewBlock) => Promise<unknown>;
}) {
    const selection = useEditorStore((state) => state.selection);
    const elements = useDocumentStore((state) => state.document.elements);

    const [name, setName] = useState('');
    const [category, setCategory] = useState<AssetCategory>('storage');
    const [draft, setDraft] = useState<BlockDraft | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const file = useRef<HTMLInputElement>(null);

    function fromSelection(): void {
        const chosen = elements.filter((element) => selection.includes(element.id));
        const made = blockFromSelection(chosen, makeLookup(elements));

        if (made === null) {
            setError('There is no geometry in the selection to make a block from.');
            setDraft(null);

            return;
        }

        setDraft(made);
        setSource(
            made.ignored === 0
                ? `${chosen.length} ${chosen.length === 1 ? 'element' : 'elements'}`
                : `${chosen.length - made.ignored} of ${chosen.length} elements — measurements and labels are left out`,
        );
        setError(null);
    }

    async function fromFile(chosen: File): Promise<void> {
        const result = importSvg(await chosen.text());

        if (!result.ok) {
            setError(result.reason);
            setDraft(null);

            return;
        }

        setDraft({ draw: result.draw, width: result.width, height: result.height, ignored: 0 });
        setSource(chosen.name);
        setError(null);

        if (name === '') {
            setName(chosen.name.replace(/\.svg$/i, ''));
        }
    }

    async function save(): Promise<void> {
        if (draft === null || name.trim() === '') {
            return;
        }

        setBusy(true);

        try {
            await onCreate({
                name: name.trim(),
                category,
                width: draft.width,
                height: draft.height,
                draw: draft.draw,
            });

            onOpenChange(false);
        } catch {
            setError('Could not save that block.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Button size="sm" onClick={fromSelection} disabled={selection.length === 0}>
                    From selection
                </Button>
                <Button size="sm" onClick={() => file.current?.click()}>
                    From an SVG file
                </Button>
                <input
                    ref={file}
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="sr-only"
                    onChange={(event) => {
                        const chosen = event.target.files?.[0];

                        if (chosen !== undefined) void fromFile(chosen);

                        // Cleared, so choosing the same file twice still fires a change.
                        event.target.value = '';
                    }}
                />
            </div>

            {selection.length === 0 && draft === null && (
                <p className="text-ink-subtle text-xs">
                    Nothing is selected. Select what the block is made of, or choose a file.
                </p>
            )}

            {draft !== null && (
                <div className="border-line bg-sunken flex items-center gap-3 rounded-md border p-3">
                    <span className="text-ink-muted">
                        <AssetThumbnail asset={draftDefinition(draft, name)} size={56} />
                    </span>

                    <div className="space-y-0.5">
                        <p className="text-ink text-[13px]">
                            {formatLength(draft.width, 'mm')} × {formatLength(draft.height, 'mm')}
                        </p>
                        <p className="text-ink-subtle text-xs">{source}</p>
                    </div>
                </div>
            )}

            <TextField
                label="Name"
                value={name}
                placeholder="Kitchen unit"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
            />

            <div className="space-y-1.5">
                <label htmlFor="block-category" className="text-ink block text-[13px] font-medium">
                    Category
                </label>
                <select
                    id="block-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as AssetCategory)}
                    className="border-line-strong bg-surface text-ink hover:border-ink-subtle h-9.5 w-full rounded-md border px-2 text-sm"
                >
                    {ASSET_CATEGORIES.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                            {entry.name}
                        </option>
                    ))}
                </select>
            </div>

            {error !== null && <p className="text-danger text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                    variant="primary"
                    busy={busy}
                    disabled={draft === null || name.trim() === ''}
                    onClick={() => void save()}
                >
                    Save block
                </Button>
            </div>
        </div>
    );
}
