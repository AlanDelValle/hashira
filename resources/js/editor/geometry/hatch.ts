import { pointInPolygon } from './polygon';
import type { Segment } from './segment';
import { type Point } from './vec';

/**
 * Filling a shape with lines.
 *
 * A hatch here is geometry, never a fill pattern. The alternative is a `CanvasPattern` on
 * screen, an SVG `<pattern>`, a tiling pattern in the PDF and nothing at all in DXF, which is
 * four implementations of one drawing and therefore four slightly different drawings — the
 * thing a single scene exists to prevent. R12 has no `HATCH` either. Clipped lines are what
 * every reader can draw identically, and what a hatch explodes to on arrival anyway.
 *
 * Everything below works in world millimetres and knows nothing about pens, scale or zoom.
 */

/** Rings are filled by the even-odd rule, so a shape may be several of them. */
export type Rings = readonly (readonly Point[])[];

/**
 * Parallel lines at `angle`, `spacing` apart, clipped to the rings.
 *
 * Worked in the hatch's own frame: the rings are turned so the lines run flat, every edge that
 * straddles a line contributes a crossing, and the crossings are paired off along it. Even-odd
 * pairing is what makes a shape with a hole in it come out with the hole empty, and it is why
 * this takes rings rather than a polygon.
 *
 * `limit` is a ceiling on the segments produced. A wall at a sensible spacing is a few dozen;
 * a site plan at the same spacing is tens of thousands, and a drawing that stops responding is
 * worse than one whose hatch is coarser than asked for. The caller coarsens and tries again.
 */
export function clipLines(rings: Rings, angle: number, spacing: number, limit: number): Segment[] {
    if (spacing <= 0 || limit <= 0) {
        return [];
    }

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const turned = rings.map((ring) =>
        ring.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })),
    );

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const ring of turned) {
        for (const p of ring) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }

    if (!Number.isFinite(minX) || maxY - minY <= 0) {
        return [];
    }

    /*
     * The lattice sits on half multiples of the spacing, anchored to the origin rather than to
     * the shape. Anchoring globally is what stops a run of walls reading as several different
     * hatches butted together, each having started its own count. The half is what keeps a line
     * off the boundary: on a whole multiple a square at the origin gets its first line lying
     * exactly along its own bottom edge, which draws a hatch line on top of an outline and
     * thickens the very thing it is filling.
     */
    const first = (Math.ceil(minY / spacing - 0.5) + 0.5) * spacing;
    const back = { cos: Math.cos(angle), sin: Math.sin(angle) };
    const out: Segment[] = [];

    for (let y = first; y <= maxY && out.length < limit; y += spacing) {
        const crossings: number[] = [];

        for (const ring of turned) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i];
                const b = ring[(i + 1) % ring.length];

                if (a === undefined || b === undefined) continue;

                // A crossing counts once: the lower end is in, the upper end is out. Without
                // that rule a line through a vertex is counted twice and the fill flips.
                if (a.y <= y === b.y <= y) continue;

                crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
            }
        }

        crossings.sort((one, other) => one - other);

        for (let i = 0; i + 1 < crossings.length && out.length < limit; i += 2) {
            const from = crossings[i];
            const to = crossings[i + 1];

            if (from === undefined || to === undefined || to - from < 1e-9) continue;

            out.push({
                a: { x: from * back.cos - y * back.sin, y: from * back.sin + y * back.cos },
                b: { x: to * back.cos - y * back.sin, y: to * back.sin + y * back.cos },
            });
        }
    }

    return out;
}

/**
 * Points scattered inside the rings, on a jittered grid.
 *
 * A stipple has to be irregular to read as one and identical every time it is drawn: a
 * concrete wall that shimmers as the drawing pans, or comes out differently in the PDF than it
 * looked on screen, is not a drawing. So the jitter is pseudo-random from a seed the caller
 * derives from the element, and the same element produces the same speckle for ever.
 */
export function scatter(rings: Rings, spacing: number, limit: number, seed: number): Point[] {
    if (spacing <= 0 || limit <= 0) {
        return [];
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const ring of rings) {
        for (const p of ring) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }

    if (!Number.isFinite(minX)) {
        return [];
    }

    const random = seeded(seed);
    const out: Point[] = [];

    for (
        let y = Math.ceil(minY / spacing) * spacing;
        y <= maxY && out.length < limit;
        y += spacing
    ) {
        for (
            let x = Math.ceil(minX / spacing) * spacing;
            x <= maxX && out.length < limit;
            x += spacing
        ) {
            const at = {
                x: x + (random() - 0.5) * spacing,
                y: y + (random() - 0.5) * spacing,
            };

            if (inside(rings, at)) {
                out.push(at);
            }
        }
    }

    return out;
}

/**
 * Straight runs turned into wandering ones, for the patterns that are drawn by hand.
 *
 * Marble veining, wood grain and concrete seen in elevation are all a line that does not want
 * to be straight. The ends are left exactly where the clip put them — on the boundary — and
 * only the middle is moved, so a vein still starts and stops at the edge of the shape it is
 * in. It can still lean a little way out of a sharp inward corner, by at most `amount`.
 */
export function wander(runs: readonly Segment[], amount: number, seed: number): Point[][] {
    const random = seeded(seed);

    return runs.map((run) => {
        const dx = run.b.x - run.a.x;
        const dy = run.b.y - run.a.y;
        const length = Math.hypot(dx, dy);

        if (length <= amount * 2) {
            return [run.a, run.b];
        }

        const steps = Math.max(2, Math.min(8, Math.round(length / (amount * 3))));
        const nx = -dy / length;
        const ny = dx / length;
        const points: Point[] = [run.a];

        for (let step = 1; step < steps; step++) {
            const t = step / steps;
            const off = (random() - 0.5) * 2 * amount;

            points.push({
                x: run.a.x + dx * t + nx * off,
                y: run.a.y + dy * t + ny * off,
            });
        }

        points.push(run.b);

        return points;
    });
}

/** Even-odd across every ring, so a hole counts as outside. */
function inside(rings: Rings, at: Point): boolean {
    let within = false;

    for (const ring of rings) {
        if (ring.length >= 3 && pointInPolygon(ring, at)) {
            within = !within;
        }
    }

    return within;
}

/**
 * A small, fast, repeatable generator.
 *
 * `Math.random` would do everything this does except the one thing that matters, which is
 * giving the same answer twice.
 */
function seeded(seed: number): () => number {
    let state = seed | 0 || 1;

    return () => {
        state = (state + 0x6d2b79f5) | 0;

        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A number from an element's id, so the same element always speckles the same way. */
export function seedFrom(id: string): number {
    let hash = 0x811c9dc5;

    for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash | 0;
}
