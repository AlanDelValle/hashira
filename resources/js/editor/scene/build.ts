import { findAsset, type AssetPrimitive } from '@/editor/assets/library';
import { TAU } from '@/editor/geometry/angle';
import {
    add,
    clamp,
    distance,
    normalize,
    perpendicular,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';
import {
    dimensionFrame,
    dimensionStrokes,
    doorSwing,
    elementWorldPoints,
    hostedFrame,
    makeLookup,
    type ElementLookup,
} from '@/editor/model/elements';
import { formatLength } from '@/editor/model/units';
import type {
    AssetElement,
    DimensionElement,
    DisplayUnit,
    DoorElement,
    Element,
    HostedElement,
    Layer,
    WallElement,
    WindowElement,
} from '@/editor/model/types';

import { PEN, pen, type ScenePalette, type SceneLayer, type ScenePrimitive } from './types';

/**
 * Turning a document into primitives.
 *
 * This is the only place that knows what a wall with a door in it looks like. The screen, a
 * PNG, an SVG and a PDF all consume what comes out, so they cannot disagree about it.
 */

export interface SceneOptions {
    palette: ScenePalette;
    /**
     * The unit a dimension writes its value in. A measurement is read off the geometry every
     * time it is drawn, so the builder needs to know how to say it.
     */
    unit?: DisplayUnit;
    /** Paint everything this colour instead of its layer's — selection, hover, previews. */
    overrideColor?: string;
    /** Hidden means hidden, in export as much as on screen. */
    includeHidden?: boolean;
}

export function buildScene(
    elements: readonly Element[],
    layers: readonly Layer[],
    options: SceneOptions,
): SceneLayer[] {
    const lookup = makeLookup(elements);
    const ordered = [...layers].sort((a, b) => a.order - b.order);

    const visible = new Set(
        ordered
            .filter((layer) => options.includeHidden === true || layer.visible)
            .map((layer) => layer.id),
    );

    /*
     * A wall's gaps come only from openings on visible layers. Hiding "Openings" therefore
     * gives solid walls rather than walls full of holes with nothing in them.
     */
    const openings = new Map<string, HostedElement[]>();

    for (const element of elements) {
        if (element.type !== 'door' && element.type !== 'window') continue;
        if (!visible.has(element.layerId)) continue;

        const existing = openings.get(element.geometry.hostId);

        if (existing === undefined) {
            openings.set(element.geometry.hostId, [element]);
        } else {
            existing.push(element);
        }
    }

    const byLayer = new Map<string, ScenePrimitive[]>();

    for (const element of elements) {
        if (!visible.has(element.layerId)) continue;

        const colour =
            options.overrideColor ??
            ordered.find((layer) => layer.id === element.layerId)?.color ??
            options.palette.ink;

        const primitives = primitivesFor(element, {
            lookup,
            openings,
            colour,
            palette: options.palette,
            overrideColor: options.overrideColor,
            unit: options.unit ?? 'm',
        });

        if (primitives.length === 0) continue;

        const existing = byLayer.get(element.layerId);

        if (existing === undefined) {
            byLayer.set(element.layerId, primitives);
        } else {
            existing.push(...primitives);
        }
    }

    return ordered.flatMap((layer): SceneLayer[] => {
        const primitives = byLayer.get(layer.id);

        return primitives === undefined ? [] : [{ id: layer.id, name: layer.name, primitives }];
    });
}

interface BuildContext {
    lookup: ElementLookup;
    openings: Map<string, HostedElement[]>;
    colour: string;
    palette: ScenePalette;
    overrideColor?: string | undefined;
    unit: DisplayUnit;
}

function primitivesFor(element: Element, context: BuildContext): ScenePrimitive[] {
    switch (element.type) {
        case 'wall':
            return wallPrimitives(element, context);

        case 'line':
            return [
                {
                    kind: 'polyline',
                    points: elementWorldPoints(element, context.lookup),
                    closed: false,
                    stroke: pen(context.colour),
                },
            ];

        case 'rect':
            return [
                {
                    kind: 'polyline',
                    points: elementWorldPoints(element, context.lookup),
                    closed: true,
                    stroke: pen(context.colour),
                    fill: element.style?.fill ?? null,
                },
            ];

        case 'polygon':
            return [
                {
                    kind: 'polyline',
                    points: elementWorldPoints(element, context.lookup),
                    closed: element.geometry.closed,
                    stroke: pen(context.colour),
                    fill: element.geometry.closed ? (element.style?.fill ?? null) : null,
                },
            ];

        case 'room':
            return [
                {
                    kind: 'polyline',
                    points: elementWorldPoints(element, context.lookup),
                    closed: true,
                    stroke: pen(context.colour),
                    fill: context.palette.roomFill,
                },
            ];

        case 'circle':
            return [
                {
                    kind: 'circle',
                    centre: { x: element.transform.x, y: element.transform.y },
                    radius: element.geometry.radius,
                    stroke: pen(context.colour),
                    fill: element.style?.fill ?? null,
                },
            ];

        case 'text':
            return [
                {
                    kind: 'text',
                    at: { x: element.transform.x, y: element.transform.y },
                    content: element.geometry.content,
                    size: element.geometry.fontSize,
                    align: element.geometry.align,
                    rotation: element.transform.rotation,
                    fill: context.colour,
                },
            ];

        case 'door':
            return doorPrimitives(element, context);

        case 'window':
            return windowPrimitives(element, context);

        case 'asset':
            return assetPrimitives(element, context);

        case 'dimension':
            return dimensionPrimitives(element, context);
    }
}

/**
 * A measurement: extension lines, a dimension line ticked at both ends, and the distance
 * written above it.
 *
 * The value carries its unit. A drawing leaves the screen as a PDF that is read without any
 * of this software around it, and "6.00" on a sheet with no unit stated anywhere is a number
 * somebody will eventually build in the wrong one.
 */
function dimensionPrimitives(element: DimensionElement, context: BuildContext): ScenePrimitive[] {
    const frame = dimensionFrame(element);

    if (frame === null) {
        return [];
    }

    const stroke = pen(context.colour, PEN.fine);

    return [
        ...dimensionStrokes(frame).map(([from, to]): ScenePrimitive => ({
            kind: 'polyline',
            points: [from, to],
            closed: false,
            stroke,
        })),
        {
            kind: 'text',
            at: frame.textAt,
            content: formatLength(frame.length, context.unit),
            size: element.geometry.fontSize,
            align: 'center',
            rotation: frame.textRotation,
            fill: context.colour,
        },
    ];
}

/**
 * A wall is a solid band, interrupted where an opening sits in it. The band is one stroke as
 * wide as the wall is thick, with butt ends, which gives the poché and squares off the cuts.
 */
function wallPrimitives(wall: WallElement, context: BuildContext): ScenePrimitive[] {
    const [a, b] = elementWorldPoints(wall, context.lookup);

    if (a === undefined || b === undefined) {
        return [];
    }

    const length = distance(a, b);

    if (length === 0) {
        return [];
    }

    const direction = normalize(subtract(b, a));
    const stroke = {
        color: context.colour,
        width: { kind: 'world' as const, mm: wall.geometry.thickness },
        cap: 'butt' as const,
    };

    const gaps = (context.openings.get(wall.id) ?? [])
        .map((opening) => {
            const half = opening.geometry.width / 2;

            return [
                clamp(opening.geometry.offset - half, 0, length),
                clamp(opening.geometry.offset + half, 0, length),
            ] as const;
        })
        .sort((first, second) => first[0] - second[0]);

    const solid: [number, number][] = [];
    let cursor = 0;

    for (const [start, end] of gaps) {
        if (start > cursor) {
            solid.push([cursor, start]);
        }

        cursor = Math.max(cursor, end);
    }

    if (cursor < length) {
        solid.push([cursor, length]);
    }

    return solid.map(([from, to]): ScenePrimitive => ({
        kind: 'polyline',
        points: [add(a, scale(direction, from)), add(a, scale(direction, to))],
        closed: false,
        stroke,
    }));
}

/** The square ends of the wall where an opening begins and stops. */
function jambs(opening: HostedElement, context: BuildContext): ScenePrimitive[] {
    const frame = hostedFrame(opening, context.lookup);

    if (frame === null) {
        return [];
    }

    const along = scale(frame.direction, frame.halfWidth);
    const across = scale(perpendicular(frame.direction), frame.thickness / 2);
    const start = subtract(frame.centre, along);
    const end = add(frame.centre, along);

    return [start, end].map((at): ScenePrimitive => ({
        kind: 'polyline',
        points: [subtract(at, across), add(at, across)],
        closed: false,
        stroke: pen(context.colour, PEN.fine, 'butt'),
    }));
}

function windowPrimitives(element: WindowElement, context: BuildContext): ScenePrimitive[] {
    const frame = hostedFrame(element, context.lookup);

    if (frame === null) {
        return [];
    }

    const along = scale(frame.direction, frame.halfWidth);
    const across = scale(perpendicular(frame.direction), frame.thickness / 2);
    const start = subtract(frame.centre, along);
    const end = add(frame.centre, along);
    const stroke = pen(context.colour, PEN.fine, 'butt');

    // The frame: both faces of the glazing, and the pane line down the middle.
    const rails: [Point, Point][] = [
        [subtract(start, across), subtract(end, across)],
        [add(start, across), add(end, across)],
        [start, end],
    ];

    return [
        ...jambs(element, context),
        ...rails.map(([from, to]): ScenePrimitive => ({
            kind: 'polyline',
            points: [from, to],
            closed: false,
            stroke,
        })),
    ];
}

function doorPrimitives(element: DoorElement, context: BuildContext): ScenePrimitive[] {
    const frame = hostedFrame(element, context.lookup);

    if (frame === null) {
        return [];
    }

    const swing = doorSwing(element, frame);
    const leafEnd = add(swing.hinge, scale(swing.openDirection, swing.radius));

    const from = Math.atan2(swing.openDirection.y, swing.openDirection.x);
    const to = Math.atan2(swing.towardsOtherJamb.y, swing.towardsOtherJamb.x);

    return [
        ...jambs(element, context),
        {
            kind: 'polyline',
            points: [swing.hinge, leafEnd],
            closed: false,
            stroke: pen(context.colour),
        },
        {
            kind: 'arc',
            centre: swing.hinge,
            radius: swing.radius,
            from,
            to,
            anticlockwise: (to - from + TAU) % TAU > Math.PI,
            stroke: pen(context.overrideColor ?? context.palette.subtle, PEN.fine),
        },
    ];
}

/**
 * A library block, mapped out of its normalised 0–1 box into the element's own millimetres.
 * Nothing is scaled non-uniformly except deliberately: an ellipse in the box becomes the
 * ellipse the block's proportions imply, which is what a plan view wants.
 */
function assetPrimitives(element: AssetElement, context: BuildContext): ScenePrimitive[] {
    const definition = findAsset(element.geometry.assetId);
    const { width, height, mirrored } = element.geometry;
    const stroke = pen(context.colour);

    const place = (nx: number, ny: number): Point => {
        const local = { x: (nx - 0.5) * width * (mirrored ? -1 : 1), y: (ny - 0.5) * height };
        const cos = Math.cos(element.transform.rotation);
        const sin = Math.sin(element.transform.rotation);

        return {
            x: element.transform.x + local.x * cos - local.y * sin,
            y: element.transform.y + local.x * sin + local.y * cos,
        };
    };

    if (definition === undefined) {
        // An unknown block still occupies space; showing its footprint is more honest than a
        // silent gap where someone placed something.
        return [
            {
                kind: 'polyline',
                points: [place(0, 0), place(1, 0), place(1, 1), place(0, 1)],
                closed: true,
                stroke: { ...stroke, dash: [1.5, 1.2] },
            },
        ];
    }

    return definition.draw.flatMap((primitive) =>
        assetPrimitive(primitive, place, stroke, element, Math.min(width, height)),
    );
}

function assetPrimitive(
    primitive: AssetPrimitive,
    place: (nx: number, ny: number) => Point,
    stroke: ReturnType<typeof pen>,
    element: AssetElement,
    arcScale: number,
): ScenePrimitive[] {
    switch (primitive.kind) {
        case 'rect':
            return [
                {
                    kind: 'polyline',
                    points: [
                        place(primitive.x, primitive.y),
                        place(primitive.x + primitive.w, primitive.y),
                        place(primitive.x + primitive.w, primitive.y + primitive.h),
                        place(primitive.x, primitive.y + primitive.h),
                    ],
                    closed: true,
                    stroke,
                },
            ];

        case 'line':
            return [
                {
                    kind: 'polyline',
                    points: [place(primitive.x1, primitive.y1), place(primitive.x2, primitive.y2)],
                    closed: false,
                    stroke,
                },
            ];

        case 'ellipse': {
            const centre = place(primitive.cx, primitive.cy);

            return [
                {
                    kind: 'ellipse',
                    centre,
                    rx: distance(centre, place(primitive.cx + primitive.rx, primitive.cy)),
                    ry: distance(centre, place(primitive.cx, primitive.cy + primitive.ry)),
                    stroke,
                },
            ];
        }

        case 'polyline': {
            const points: Point[] = [];

            for (let i = 0; i + 1 < primitive.points.length; i += 2) {
                const x = primitive.points[i];
                const y = primitive.points[i + 1];

                if (x !== undefined && y !== undefined) {
                    points.push(place(x, y));
                }
            }

            return points.length < 2
                ? []
                : [{ kind: 'polyline', points, closed: primitive.closed, stroke }];
        }

        case 'arc':
            return [
                {
                    kind: 'arc',
                    centre: place(primitive.cx, primitive.cy),
                    radius: primitive.r * arcScale,
                    from: primitive.from + element.transform.rotation,
                    to: primitive.to + element.transform.rotation,
                    anticlockwise: false,
                    stroke,
                },
            ];
    }
}
