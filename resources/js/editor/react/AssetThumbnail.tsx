import type { AssetDefinition } from '@/editor/assets/library';

/**
 * A block, drawn from its own definition rather than from an icon file — so the thumbnail is
 * the block. It cannot drift out of date, and a block somebody made this morning has a
 * picture in the library without anybody drawing one.
 */
export function AssetThumbnail({ asset, size = 40 }: { asset: AssetDefinition; size?: number }) {
    const aspect = asset.width / asset.height;
    const boxWidth = aspect >= 1 ? 1 : aspect;
    const boxHeight = aspect >= 1 ? 1 / aspect : 1;
    const offsetX = (1 - boxWidth) / 2;
    const offsetY = (1 - boxHeight) / 2;

    const x = (n: number) => (offsetX + n * boxWidth) * 40;
    const y = (n: number) => (offsetY + n * boxHeight) * 40;

    return (
        <svg
            viewBox="0 0 40 40"
            width={size}
            height={size}
            className="shrink-0"
            fill="none"
            aria-hidden
        >
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
