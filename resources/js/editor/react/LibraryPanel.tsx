import { Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
    ASSET_CATEGORIES,
    ASSET_LIBRARY,
    type AssetCategory,
    type AssetDefinition,
} from '@/editor/assets/library';
import { formatLength } from '@/editor/model/units';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { blockDefinition, useBlocks } from '@/projects/useBlocks';
import { cn } from '@/lib/cn';

import { AssetThumbnail } from './AssetThumbnail';
import { NewBlockDialog } from './NewBlockDialog';

/**
 * The block library.
 *
 * Two shelves in one place: the blocks that ship with the editor, and the blocks this account
 * has made. They are the same kind of thing — a name, a size and a drawing in a normalised box
 * — so they are searched together and placed the same way, and only the ones you made can be
 * thrown away.
 *
 * Searching matters more than it looks: sixty-odd blocks in seven categories is more than a
 * panel this wide can show at once, and scrolling for a bidet is not drafting.
 */
export function LibraryPanel() {
    const unit = useDocumentStore((state) => state.document.settings.unit);
    const pendingAssetId = useEditorStore((state) => state.pendingAssetId);
    const setPendingAsset = useEditorStore((state) => state.setPendingAsset);

    const { blocks, create, remove } = useBlocks();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<AssetCategory | 'all'>('all');
    const [making, setMaking] = useState(false);

    const own = useMemo(() => blocks.map(blockDefinition), [blocks]);

    const shelves = useMemo(() => {
        const matches = (asset: AssetDefinition): boolean =>
            (category === 'all' || asset.category === category) &&
            (query.trim() === '' || asset.name.toLowerCase().includes(query.trim().toLowerCase()));

        return [
            { id: 'own', name: 'Yours', items: own.filter(matches) },
            ...ASSET_CATEGORIES.map((entry) => ({
                id: entry.id,
                name: entry.name,
                items: ASSET_LIBRARY.filter((asset) => asset.category === entry.id).filter(matches),
            })),
        ].filter((shelf) => shelf.items.length > 0);
    }, [own, query, category]);

    return (
        <aside
            aria-label="Block library"
            className="border-line bg-surface flex w-52 shrink-0 flex-col overflow-hidden border-r"
        >
            <div className="border-line bg-surface border-b">
                <div className="flex items-center justify-between px-3 py-2">
                    <h2 className="text-ink-subtle text-[11px] font-medium tracking-wide uppercase">
                        Library
                    </h2>

                    <button
                        type="button"
                        onClick={() => setMaking(true)}
                        title="New block"
                        aria-label="New block"
                        className="text-ink-muted hover:bg-sunken hover:text-ink rounded-sm p-1"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>

                <div className="relative px-2 pb-2">
                    <Search className="text-ink-subtle pointer-events-none absolute top-1.5 left-4 h-3.5 w-3.5" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search"
                        aria-label="Search blocks"
                        className="border-line-strong bg-surface text-ink placeholder:text-ink-subtle h-7 w-full rounded-md border pr-2 pl-7 text-[12px]"
                    />
                </div>

                <div className="px-2 pb-2">
                    <select
                        value={category}
                        aria-label="Category"
                        onChange={(event) =>
                            setCategory(event.target.value as AssetCategory | 'all')
                        }
                        className="border-line-strong bg-surface text-ink-muted h-7 w-full rounded-md border px-1.5 text-[12px]"
                    >
                        <option value="all">All categories</option>
                        {ASSET_CATEGORIES.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {shelves.length === 0 && (
                    <p className="text-ink-subtle px-3 py-4 text-[12px]">
                        No blocks match “{query}”.
                    </p>
                )}

                {shelves.map((shelf) => (
                    <section key={shelf.id} className="border-line border-b py-2">
                        <h3 className="text-ink-muted px-3 pb-1.5 text-[12px] font-medium">
                            {shelf.name}
                        </h3>

                        <ul className="grid grid-cols-2 gap-1 px-2">
                            {shelf.items.map((asset) => (
                                <li key={asset.id} className="group relative">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setPendingAsset(
                                                pendingAssetId === asset.id ? null : asset.id,
                                            )
                                        }
                                        aria-pressed={pendingAssetId === asset.id}
                                        title={`${asset.name} · ${formatLength(asset.width, unit)} × ${formatLength(asset.height, unit)}`}
                                        className={cn(
                                            'flex w-full flex-col items-center gap-1 rounded-md p-1.5 transition-colors',
                                            pendingAssetId === asset.id
                                                ? 'bg-accent-soft text-accent'
                                                : 'text-ink-muted hover:bg-sunken hover:text-ink',
                                        )}
                                    >
                                        <AssetThumbnail asset={asset} size={36} />
                                        <span className="w-full truncate text-center text-[11px]">
                                            {asset.name}
                                        </span>
                                    </button>

                                    {asset.own === true && (
                                        <button
                                            type="button"
                                            onClick={() => void remove(asset.id)}
                                            title={`Delete ${asset.name}`}
                                            aria-label={`Delete ${asset.name}`}
                                            className="text-ink-subtle hover:bg-sunken hover:text-danger absolute top-0.5 right-0.5 rounded-sm p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            <NewBlockDialog open={making} onOpenChange={setMaking} onCreate={create} />
        </aside>
    );
}
