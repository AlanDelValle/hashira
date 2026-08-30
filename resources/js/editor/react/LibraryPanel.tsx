import { ASSET_CATEGORIES, ASSET_LIBRARY, type AssetDefinition } from '@/editor/assets/library';
import { formatLength } from '@/editor/model/units';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { cn } from '@/lib/cn';

/**
 * The block library.
 *
 * Each entry is drawn from its own definition rather than from an icon file, so the thumbnail
 * is the block — it cannot drift out of date, and adding a block to the library adds it here
 * with no second asset to maintain.
 */
export function LibraryPanel() {
    const unit = useDocumentStore((state) => state.document.settings.unit);
    const pendingAssetId = useEditorStore((state) => state.pendingAssetId);
    const setPendingAsset = useEditorStore((state) => state.setPendingAsset);

    return (
        <aside
            aria-label="Block library"
            className="border-line bg-surface w-52 shrink-0 overflow-y-auto border-r"
        >
            <h2 className="text-ink-subtle border-line bg-surface sticky top-0 border-b px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                Library
            </h2>

            {ASSET_CATEGORIES.map((category) => {
                const items = ASSET_LIBRARY.filter((asset) => asset.category === category.id);

                return (
                    <section key={category.id} className="border-line border-b py-2">
                        <h3 className="text-ink-muted px-3 pb-1.5 text-[12px] font-medium">
                            {category.name}
                        </h3>

                        <ul className="grid grid-cols-2 gap-1 px-2">
                            {items.map((asset) => (
                                <li key={asset.id}>
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
                                        <AssetThumbnail asset={asset} />
                                        <span className="w-full truncate text-center text-[11px]">
                                            {asset.name}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </aside>
    );
}

/** The block's own primitives, mapped into a small square. */
function AssetThumbnail({ asset }: { asset: AssetDefinition }) {
    const aspect = asset.width / asset.height;
    const boxWidth = aspect >= 1 ? 1 : aspect;
    const boxHeight = aspect >= 1 ? 1 / aspect : 1;
    const offsetX = (1 - boxWidth) / 2;
    const offsetY = (1 - boxHeight) / 2;

    const x = (n: number) => (offsetX + n * boxWidth) * 40;
    const y = (n: number) => (offsetY + n * boxHeight) * 40;

    return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden>
            {asset.draw.map((primitive, index) => {
                switch (primitive.kind) {
                    case 'rect':
                        return (
                            <rect
                                key={index}
                                x={x(primitive.x)}
                                y={y(primitive.y)}
                                width={x(primitive.x + primitive.w) - x(primitive.x)}
                                height={y(primitive.y + primitive.h) - y(primitive.y)}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        );

                    case 'line':
                        return (
                            <line
                                key={index}
                                x1={x(primitive.x1)}
                                y1={y(primitive.y1)}
                                x2={x(primitive.x2)}
                                y2={y(primitive.y2)}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        );

                    case 'ellipse':
                        return (
                            <ellipse
                                key={index}
                                cx={x(primitive.cx)}
                                cy={y(primitive.cy)}
                                rx={Math.abs(x(primitive.cx + primitive.rx) - x(primitive.cx))}
                                ry={Math.abs(y(primitive.cy + primitive.ry) - y(primitive.cy))}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        );

                    case 'polyline': {
                        const pairs: string[] = [];

                        for (let i = 0; i + 1 < primitive.points.length; i += 2) {
                            const px = primitive.points[i];
                            const py = primitive.points[i + 1];

                            if (px !== undefined && py !== undefined) {
                                pairs.push(`${x(px)},${y(py)}`);
                            }
                        }

                        return primitive.closed ? (
                            <polygon
                                key={index}
                                points={pairs.join(' ')}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        ) : (
                            <polyline
                                key={index}
                                points={pairs.join(' ')}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        );
                    }

                    case 'arc': {
                        // Thumbnails are small; an arc reads well enough as a full circle.
                        const radius = primitive.r * Math.min(boxWidth, boxHeight) * 40;

                        return (
                            <circle
                                key={index}
                                cx={x(primitive.cx)}
                                cy={y(primitive.cy)}
                                r={radius}
                                stroke="currentColor"
                                strokeWidth={0.9}
                            />
                        );
                    }
                }
            })}
        </svg>
    );
}
