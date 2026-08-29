/**
 * A drawing, not a screenshot.
 *
 * Everything here is what the tool is for: wall centrelines given thickness, an opening cut
 * into the wall it belongs to, a door leaf with its swing, a window, and a dimension read off
 * the geometry. Drawn in the product's own palette so the landing page and the editor look
 * like the same piece of software.
 */
export function PlanDrawing({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 720 540"
            className={className}
            role="img"
            aria-label="Floor plan of a six by four metre room with a door and a window, dimensioned"
        >
            <defs>
                <pattern id="plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path
                        d="M20 0H0V20"
                        fill="none"
                        className="stroke-grid-minor"
                        strokeWidth="1"
                    />
                </pattern>
            </defs>

            <rect width="720" height="540" className="fill-sheet" />
            <rect x="20" y="20" width="680" height="500" fill="url(#plan-grid)" />

            {/* Walls. Gaps are the openings; the poché stops where the opening starts. */}
            <g
                className="stroke-ink"
                strokeWidth="15"
                strokeLinecap="butt"
                fill="none"
                shapeRendering="crispEdges"
            >
                <path d="M60 60H280" />
                <path d="M440 60H660" />
                <path d="M660 60V460" />
                <path d="M660 460H270" />
                <path d="M180 460H60" />
                <path d="M60 460V60" />
            </g>

            {/* Window: the frame across the opening in the north wall. */}
            <g className="stroke-ink" fill="none" strokeWidth="2">
                <path d="M280 53.5H440" />
                <path d="M280 66.5H440" />
                <path d="M280 60H440" />
                <path d="M280 53.5V66.5" />
                <path d="M440 53.5V66.5" />
            </g>

            {/* Door: jambs, leaf, and the arc the leaf sweeps. */}
            <g className="stroke-ink" fill="none" strokeWidth="2">
                <path d="M180 453.5V466.5" />
                <path d="M270 453.5V466.5" />
                <path d="M180 460V370" strokeWidth="4" />
                <path d="M180 370A90 90 0 0 1 270 460" className="stroke-ink-subtle" />
            </g>

            {/* Dimension: extension lines, ticks, and the value read from the geometry. */}
            <g className="stroke-ink-muted" fill="none" strokeWidth="1.5">
                <path d="M60 476V506" />
                <path d="M660 476V506" />
                <path d="M60 496H328" />
                <path d="M392 496H660" />
                <path d="M54 502L66 490" />
                <path d="M654 502L666 490" />
            </g>
            <text
                x="360"
                y="502"
                textAnchor="middle"
                className="fill-ink-muted font-mono"
                fontSize="17"
            >
                6.00
            </text>

            <text x="360" y="270" textAnchor="middle" className="fill-ink-subtle" fontSize="19">
                Living
            </text>
        </svg>
    );
}
