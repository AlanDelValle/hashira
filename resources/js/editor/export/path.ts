import { TAU } from '@/editor/geometry/angle';
import type { Point } from '@/editor/geometry/vec';
import type { ScenePrimitive } from '@/editor/scene/types';

/**
 * How world millimetres become the target's units. The SVG file keeps world millimetres and
 * uses the identity; the PDF pre-transforms into points measured from the top-left of the
 * page, so that pdf-lib can draw the path with no scaling of its own — and therefore no
 * ambiguity about whether a line width got scaled along with it.
 */
export interface PathTransform {
    point: (p: Point) => Point;
    length: (mm: number) => number;
}

export const IDENTITY_TRANSFORM: PathTransform = {
    point: (p) => p,
    length: (mm) => mm,
};

/**
 * Path data for the two outputs that speak SVG: the SVG file itself, and pdf-lib, which draws
 * SVG paths directly. Circles, ellipses and text are not paths in either target and are
 * handled by each exporter with its own primitive.
 *
 * Coordinates are world millimetres, y growing downward — the same space the scene is in.
 */
export function toPathData(
    primitive: ScenePrimitive,
    transform: PathTransform = IDENTITY_TRANSFORM,
): string | null {
    switch (primitive.kind) {
        case 'polyline': {
            const [first, ...rest] = primitive.points;

            if (first === undefined) {
                return null;
            }

            const start = transform.point(first);
            const segments = rest.map((p) => {
                const mapped = transform.point(p);

                return `L ${round(mapped.x)} ${round(mapped.y)}`;
            });

            return [
                `M ${round(start.x)} ${round(start.y)}`,
                ...segments,
                ...(primitive.closed ? ['Z'] : []),
            ].join(' ');
        }

        case 'arc': {
            const { centre, radius, from, to, anticlockwise } = primitive;

            const start = transform.point({
                x: centre.x + Math.cos(from) * radius,
                y: centre.y + Math.sin(from) * radius,
            });
            const end = transform.point({
                x: centre.x + Math.cos(to) * radius,
                y: centre.y + Math.sin(to) * radius,
            });
            const mappedRadius = transform.length(radius);

            // How much of the circle the arc covers, in the direction it is drawn.
            const swept = anticlockwise ? (from - to + TAU) % TAU : (to - from + TAU) % TAU;

            // Y grows downward here, so SVG's positive sweep direction is the clockwise one.
            const sweepFlag = anticlockwise ? 0 : 1;
            const largeArc = swept > Math.PI ? 1 : 0;

            return [
                `M ${round(start.x)} ${round(start.y)}`,
                `A ${round(mappedRadius)} ${round(mappedRadius)} 0 ${largeArc} ${sweepFlag}`,
                `${round(end.x)} ${round(end.y)}`,
            ].join(' ');
        }

        case 'circle':
        case 'ellipse':
        case 'text':
            return null;
    }
}

/** Three decimals of a millimetre is a micron: far past anything a drawing can mean. */
export function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}
