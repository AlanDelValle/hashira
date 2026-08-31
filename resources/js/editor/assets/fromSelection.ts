import { boundsFromPoints, type Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import { elementWorldPoints, type ElementLookup } from '@/editor/model/elements';
import type { Element } from '@/editor/model/types';

import { findAsset, type AssetDefinition, type AssetPrimitive } from './library';

/**
 * Making a block out of what is already drawn.
 *
 * A block is a drawing in a normalised 0–1 box, which is exactly what a selection is once you
 * know where its corners are — so this is a change of coordinates and nothing more. The point
 * of it is that the library stops being a fixed list somebody else wrote: a practice draws its
 * own kitchen units once and then places them like any other block.
 *
 * Only geometry comes across. A dimension measures the drawing it was taken from and a label
 * says something about that drawing; neither means anything once it has been scaled into a
 * box and stamped somewhere else, so both are left behind rather than quietly deformed.
 */

/** What a selection turns into, and what had to be left out of it. */
export interface BlockDraft {
    draw: AssetPrimitive[];
    width: number;
    height: number;
    /** How many selected elements could not become part of a block. */
    ignored: number;
}

/** The types a block can be drawn from. Everything else measures or annotates. */
export function canBecomeBlock(element: Element): boolean {
    return (
        element.type === 'line' ||
        element.type === 'rect' ||
        element.type === 'circle' ||
        element.type === 'polygon' ||
        element.type === 'room' ||
        element.type === 'wall' ||
        element.type === 'asset'
    );
}

export function blockFromSelection(
    elements: readonly Element[],
    lookup: ElementLookup,
): BlockDraft | null {
    const usable = elements.filter(canBecomeBlock);
    const ignored = elements.length - usable.length;

    const extent = extentOf(usable, lookup);

    if (extent === null) {
        return null;
    }

    // A perfectly straight run has no height at all; a box with no thickness cannot be
    // normalised, so it is given the thinnest one that still divides.
    const width = Math.max(extent.maxX - extent.minX, 1);
    const height = Math.max(extent.maxY - extent.minY, 1);

    const at = (p: Point): [number, number] => [
        (p.x - extent.minX) / width,
        (p.y - extent.minY) / height,
    ];

    const draw = usable.flatMap((element) => primitivesOf(element, lookup, at, width, height));

    return draw.length === 0
        ? null
        : { draw, width: Math.round(width), height: Math.round(height), ignored };
}

/** The world box the selection occupies, circles included. */
function extentOf(elements: readonly Element[], lookup: ElementLookup): Bounds | null {
    const points: Point[] = [];

    for (const element of elements) {
        if (element.type === 'circle') {
            const { x, y } = element.transform;
            const r = element.geometry.radius;

            points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
            continue;
        }

        points.push(...elementWorldPoints(element, lookup));
    }

    return boundsFromPoints(points);
}

function primitivesOf(
    element: Element,
    lookup: ElementLookup,
    at: (p: Point) => [number, number],
    width: number,
    height: number,
): AssetPrimitive[] {
    const points = elementWorldPoints(element, lookup);

    switch (element.type) {
        case 'line':
        case 'wall': {
            const [a, b] = points;

            if (a === undefined || b === undefined) return [];

            const [x1, y1] = at(a);
            const [x2, y2] = at(b);

            return [{ kind: 'line', x1, y1, x2, y2 }];
        }

        case 'circle': {
            const centre = { x: element.transform.x, y: element.transform.y };
            const [cx, cy] = at(centre);

            return [
                {
                    kind: 'ellipse',
                    cx,
                    cy,
                    // A circle in the world becomes the ellipse the box implies, which is the
                    // same rule the painter applies in the other direction.
                    rx: element.geometry.radius / width,
                    ry: element.geometry.radius / height,
                },
            ];
        }

        case 'rect':
        case 'room':
            return [ring(points, at, true)];

        case 'polygon':
            return [ring(points, at, element.geometry.closed)];

        case 'asset':
            return nested(element, at, width, height);

        default:
            return [];
    }
}

function ring(
    points: readonly Point[],
    at: (p: Point) => [number, number],
    closed: boolean,
): AssetPrimitive {
    return { kind: 'polyline', points: points.flatMap((p) => at(p)), closed };
}

/**
 * A block inside a block.
 *
 * Nesting is flattened rather than stored, because a block that refers to another one would
 * break the moment the other were deleted — and a drawing that suddenly loses a leg of every
 * chair is worse than one that carries the legs around with it.
 */
function nested(
    element: Element & { type: 'asset' },
    at: (p: Point) => [number, number],
    width: number,
    height: number,
): AssetPrimitive[] {
    const definition = findAsset(element.geometry.assetId);

    if (definition === undefined) {
        return [];
    }

    const { mirrored } = element.geometry;
    const cos = Math.cos(element.transform.rotation);
    const sin = Math.sin(element.transform.rotation);

    /** A point of the nested block's own 0–1 box, in the new one. */
    const inner = (nx: number, ny: number): [number, number] => {
        const local = {
            x: (nx - 0.5) * element.geometry.width * (mirrored ? -1 : 1),
            y: (ny - 0.5) * element.geometry.height,
        };

        return at({
            x: element.transform.x + local.x * cos - local.y * sin,
            y: element.transform.y + local.x * sin + local.y * cos,
        });
    };

    const scale = Math.min(element.geometry.width / width, element.geometry.height / height);

    return definition.draw.flatMap((primitive): AssetPrimitive[] => {
        switch (primitive.kind) {
            case 'rect': {
                const corners: [number, number][] = [
                    inner(primitive.x, primitive.y),
                    inner(primitive.x + primitive.w, primitive.y),
                    inner(primitive.x + primitive.w, primitive.y + primitive.h),
                    inner(primitive.x, primitive.y + primitive.h),
                ];

                return [{ kind: 'polyline', points: corners.flat(), closed: true }];
            }

            case 'line': {
                const [x1, y1] = inner(primitive.x1, primitive.y1);
                const [x2, y2] = inner(primitive.x2, primitive.y2);

                return [{ kind: 'line', x1, y1, x2, y2 }];
            }

            case 'ellipse': {
                const [cx, cy] = inner(primitive.cx, primitive.cy);
                const [ex] = inner(primitive.cx + primitive.rx, primitive.cy);
                const [, ey] = inner(primitive.cx, primitive.cy + primitive.ry);

                return [{ kind: 'ellipse', cx, cy, rx: Math.abs(ex - cx), ry: Math.abs(ey - cy) }];
            }

            case 'polyline': {
                const mapped: number[] = [];

                for (let i = 0; i + 1 < primitive.points.length; i += 2) {
                    const nx = primitive.points[i];
                    const ny = primitive.points[i + 1];

                    if (nx !== undefined && ny !== undefined) {
                        mapped.push(...inner(nx, ny));
                    }
                }

                return mapped.length < 4
                    ? []
                    : [{ kind: 'polyline', points: mapped, closed: primitive.closed }];
            }

            case 'arc': {
                const [cx, cy] = inner(primitive.cx, primitive.cy);

                return [
                    {
                        kind: 'arc',
                        cx,
                        cy,
                        r: primitive.r * scale,
                        from: primitive.from + element.transform.rotation,
                        to: primitive.to + element.transform.rotation,
                    },
                ];
            }
        }
    });
}

/**
 * A definition to preview a draft with, before it has been given a name or an id by the
 * server. Placing it is not possible yet; drawing it is, which is what the dialog shows.
 */
export function draftDefinition(draft: BlockDraft, name: string): AssetDefinition {
    return {
        id: 'draft',
        name,
        category: 'storage',
        width: draft.width,
        height: draft.height,
        layerId: 'layer_furniture',
        draw: draft.draw,
        own: true,
    };
}
