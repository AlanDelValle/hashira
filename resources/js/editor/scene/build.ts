import { findAsset, type AssetPrimitive } from '@/editor/assets/library';
import { TAU } from '@/editor/geometry/angle';
import { signedPolygonArea } from '@/editor/geometry/polygon';
import {
    add,
    clamp,
    distance,
    perpendicular,
    scale,
    subtract,
    type Point,
} from '@/editor/geometry/vec';
import {
    angleFrame,
    angleStrokes,
    dimensionFrame,
    dimensionStrokes,
    doorSwing,
    elementWorldPoints,
    hostedFrame,
    leaderFrame,
    makeLookup,
    radiusFrame,
    type ElementLookup,
} from '@/editor/model/elements';
import { formatAngle, formatLength } from '@/editor/model/units';
import { wallBandCorners, wallJoins, type WallJoins } from '@/editor/model/walls';
import type {
    AngleElement,
    AssetElement,
    DimensionElement,
    DisplayUnit,
    DoorElement,
    Element,
    HostedElement,
    Layer,
    LeaderElement,
    RadiusElement,
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
    /**
     * Where the walls meet, when the caller has already worked it out.
     *
     * A wall mitres against its neighbours, so painting a selected wall on its own has to be
     * told about walls it is not painting — otherwise the accent band comes out square and
     * short and leaves the mitre underneath it showing. The screen passes the joins for the
     * whole drawing, computed once a frame; an exporter, which builds one scene and stops,
     * leaves this out and lets them be worked out from what it is painting.
     */
    joins?: WallJoins;
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

    // Joins come from the visible walls only: hiding a layer must not leave a mitre cut for
    // a wall that is no longer in the drawing.
    const joins =
        options.joins ?? wallJoins(elements.filter((element) => visible.has(element.layerId)));

    // Every wall on a layer is filled as one shape, so they are gathered first and the whole
    // lot is emitted where the first of them appears.
    const wallsByLayer = new Map<string, WallElement[]>();

    for (const element of elements) {
        if (element.type !== 'wall' || !visible.has(element.layerId)) continue;

        const existing = wallsByLayer.get(element.layerId);

        if (existing === undefined) {
            wallsByLayer.set(element.layerId, [element]);
        } else {
            existing.push(element);
        }
    }

    const byLayer = new Map<string, ScenePrimitive[]>();
    const wallsDrawn = new Set<string>();

    for (const element of elements) {
        if (!visible.has(element.layerId)) continue;

        const colour =
            options.overrideColor ??
            ordered.find((layer) => layer.id === element.layerId)?.color ??
            options.palette.ink;

        if (element.type === 'wall' && wallsDrawn.has(element.layerId)) continue;

        if (element.type === 'wall') {
            wallsDrawn.add(element.layerId);
        }

        const primitives = primitivesFor(element, {
            lookup,
            openings,
            joins,
            wallsOnLayer: (layerId) => wallsByLayer.get(layerId) ?? [],
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
    joins: WallJoins;
    /** Every wall being painted on one layer, because they are filled as a single shape. */
    wallsOnLayer: (layerId: string) => readonly WallElement[];
    colour: string;
    palette: ScenePalette;
    overrideColor?: string | undefined;
    unit: DisplayUnit;
}

function primitivesFor(element: Element, context: BuildContext): ScenePrimitive[] {
    switch (element.type) {
        case 'wall':
            return wallArea(context.wallsOnLayer(element.layerId), context);

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

        case 'angle':
            return anglePrimitives(element, context);

        case 'radius':
            return radiusPrimitives(element, context);

        case 'leader':
            return leaderPrimitives(element, context);

        /*
         * An underlay is deliberately not in the scene.
         *
         * The scene is what every output consumes, and a page traced over is not part of the
         * drawing: it is usually somebody else's survey, and a plan that quietly carries it
         * into a PDF is a plan nobody can publish. The canvas paints it beneath everything as
         * a working aid — see render/underlay.ts — and no exporter ever sees it.
         */
        case 'underlay':
            return [];
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
        // One value per measurement: a chain says what each part of it is, which is the whole
        // point of drawing it as a chain rather than as one measurement of the lot.
        ...frame.segments.map((segment): ScenePrimitive => ({
            kind: 'text',
            at: segment.textAt,
            content: formatLength(segment.length, context.unit),
            size: element.geometry.fontSize,
            align: 'center',
            rotation: segment.textRotation,
            fill: context.colour,
        })),
    ];
}

/**
 * An angle: a leg out along each direction, an arc between them, and the value written just
 * outside it — level, because an angle is read as a number rather than along anything.
 */
function anglePrimitives(element: AngleElement, context: BuildContext): ScenePrimitive[] {
    const frame = angleFrame(element);

    if (frame === null) {
        return [];
    }

    const stroke = pen(context.colour, PEN.fine);

    return [
        ...angleStrokes(frame).map(([from, to]): ScenePrimitive => ({
            kind: 'polyline',
            points: [from, to],
            closed: false,
            stroke,
        })),
        {
            kind: 'arc',
            centre: frame.vertex,
            radius: frame.radius,
            from: frame.start,
            to: frame.start + frame.sweep,
            anticlockwise: frame.sweep < 0,
            stroke,
        },
        {
            kind: 'text',
            at: frame.textAt,
            content: formatAngle(frame.angle),
            size: element.geometry.fontSize,
            align: 'center',
            rotation: 0,
            fill: context.colour,
        },
    ];
}

/**
 * A radius or a diameter: a line struck from the centre out to the circle — right across it
 * for a diameter — with the value written along it.
 *
 * The value carries its mark: `R` for a radius and `⌀` for a diameter, because the two are
 * the same line with different meanings and a number alone would not say which.
 */
function radiusPrimitives(element: RadiusElement, context: BuildContext): ScenePrimitive[] {
    const frame = radiusFrame(element, context.lookup);

    if (frame === null) {
        return [];
    }

    return [
        {
            kind: 'polyline',
            points: [frame.opposite, frame.at],
            closed: false,
            stroke: pen(context.colour, PEN.fine),
        },
        {
            kind: 'text',
            at: frame.textAt,
            content: `${frame.diameter ? '⌀' : 'R'} ${formatLength(frame.measured, context.unit)}`,
            size: element.geometry.fontSize,
            align: 'center',
            rotation: frame.textRotation,
            fill: context.colour,
        },
    ];
}

/**
 * A note, and the line that says what it is about: an arrowhead at the thing, a bent line
 * back from it, and a shelf the words sit on.
 */
function leaderPrimitives(element: LeaderElement, context: BuildContext): ScenePrimitive[] {
    const frame = leaderFrame(element);

    if (frame === null) {
        return [];
    }

    const stroke = pen(context.colour, PEN.fine);

    return [
        {
            kind: 'polyline',
            points: [...frame.points, frame.shelfTo],
            closed: false,
            stroke,
        },
        {
            kind: 'area',
            rings: [[frame.tip, ...frame.barbs]],
            fill: context.colour,
            stroke: null,
        },
        {
            kind: 'text',
            at: frame.textAt,
            content: element.geometry.content,
            size: element.geometry.fontSize,
            align: frame.align,
            rotation: 0,
            fill: context.colour,
        },
    ];
}

/**
 * The poché of a run of walls: one filled shape, however many walls it took.
 *
 * Each wall contributes a band, and the bands are filled together rather than one at a time
 * because they meet edge to edge at every mitre — and two fills sharing an edge leave a pale
 * hairline along it, which is the notch it was cleaning up wearing a different hat.
 */
function wallArea(walls: readonly WallElement[], context: BuildContext): ScenePrimitive[] {
    const rings = walls.flatMap((wall) => wallRings(wall, context));

    if (rings.length === 0) {
        return [];
    }

    return [{ kind: 'area', rings, fill: context.colour, stroke: null }];
}

/**
 * The closed rings one wall is filled as.
 *
 * A band is a quadrilateral rather than a thick line because its ends are not always square:
 * where walls meet, `model/walls.ts` mitres them so the faces run into one another instead of
 * leaving a notch on the outside of every corner. An opening cuts the band into runs, and only
 * the runs that reach an end of the wall carry that end's corners — the cuts either side of a
 * door are square whatever the corners are doing.
 */
function wallRings(wall: WallElement, context: BuildContext): Point[][] {
    const [a, b] = elementWorldPoints(wall, context.lookup);

    if (a === undefined || b === undefined) {
        return [];
    }

    const length = distance(a, b);

    if (length === 0) {
        return [];
    }

    const band = context.joins.bands.get(wall.id);

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

    // A junction of three or more walls leaves a small polygon between the bands that belongs
    // to none of them. It is filed under each of them, so a wall drawn on its own still shows
    // the junction whole.
    return [
        ...solid.map(([from, to]) => wallBandCorners(wall, band, from, to)),
        ...(context.joins.patches.get(wall.id) ?? []),
    ].map(sameWinding);
}

/**
 * The non-zero fill rule counts a ring's direction, so a ring wound the other way punches a
 * hole where it overlaps its neighbour. Walls are drawn in whichever direction they were
 * dragged, so every ring is turned to face the same way before it joins the rest.
 */
function sameWinding(ring: Point[]): Point[] {
    return signedPolygonArea(ring) < 0 ? [...ring].reverse() : ring;
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
                    // The axes turn with the block. Mirroring maps the x axis onto itself
                    // reversed, so it leaves the angle alone.
                    rotation: element.transform.rotation,
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

        case 'arc': {
            // Mirroring reflects an angle about the vertical axis, which reverses the
            // direction the arc is swept in — so the two ends change places.
            const [from, to] = element.geometry.mirrored
                ? [Math.PI - primitive.to, Math.PI - primitive.from]
                : [primitive.from, primitive.to];

            return [
                {
                    kind: 'arc',
                    centre: place(primitive.cx, primitive.cy),
                    radius: primitive.r * arcScale,
                    from: from + element.transform.rotation,
                    to: to + element.transform.rotation,
                    anticlockwise: false,
                    stroke,
                },
            ];
        }
    }
}
