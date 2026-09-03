import { findAsset, type AssetPrimitive } from '@/editor/assets/library';
import { TAU } from '@/editor/geometry/angle';
import { clipLines, scatter, seedFrom, wander } from '@/editor/geometry/hatch';
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
    cloudBumps,
    dimensionFrame,
    dimensionStrokes,
    doorSwings,
    elementWorldPoints,
    hostedFrame,
    leaderFrame,
    makeLookup,
    openingRuns,
    radiusFrame,
    type ElementLookup,
} from '@/editor/model/elements';
import { findHatch } from '@/editor/model/hatches';
import { DEFAULT_LINE_TYPE, findLineType, LINE_WEIGHTS } from '@/editor/model/lineTypes';
import { formatAngle, formatLength } from '@/editor/model/units';
import { wallBandCorners, wallJoins, type WallJoins } from '@/editor/model/walls';
import type {
    AngleElement,
    AssetElement,
    DimensionElement,
    DisplayUnit,
    DoorElement,
    Element,
    HatchPattern,
    HostedElement,
    Layer,
    LeaderElement,
    RadiusElement,
    WallElement,
    WindowElement,
} from '@/editor/model/types';

import {
    PEN,
    pen,
    type ScenePalette,
    type SceneLayer,
    type ScenePrimitive,
    type Stroke,
} from './types';

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
     * The denominator of the plotted scale: 50 means 1:50.
     *
     * A hatch is specified in millimetres on the sheet, like a pen weight, and has to be drawn
     * in world millimetres like everything else in a scene — so this is the one number that
     * converts between them. Left out, a drawing hatches as though it were plotted at 1:50.
     */
    scale?: number;
    /**
     * World millimetres below which a hatch is not drawn at all.
     *
     * A screen concern rather than a drawing one: at a spacing under a pixel or two a hatch is
     * a grey rectangle that costs a frame and says nothing, so the renderer passes what a
     * couple of pixels are worth at the current zoom. An exporter passes nothing, because
     * paper has no zoom.
     */
    minimumHatchSpacing?: number;
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

    /**
     * How to find an element the scene refers to but does not contain.
     *
     * A door has no position of its own, only a distance along the wall hosting it, so a scene
     * built from *part* of a drawing has to be told where the rest of it is. Left out, the
     * elements passed are all there is — which is what a whole drawing needs, and what an
     * exporter has.
     */
    lookup?: ElementLookup;
}

export function buildScene(
    elements: readonly Element[],
    layers: readonly Layer[],
    options: SceneOptions,
): SceneLayer[] {
    const lookup = options.lookup ?? makeLookup(elements);
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

    /*
     * Walls are filled as one shape rather than one per wall, because two fills sharing an
     * edge each cover half the pixels along it and leave a seam at every mitre. What they are
     * grouped by is the layer *and* what fills them: a run marked for demolition cannot be
     * merged into the run that is staying up, or the drawing would say they were the same
     * masonry.
     */
    const wallsByGroup = new Map<string, WallElement[]>();

    for (const element of elements) {
        if (element.type !== 'wall' || !visible.has(element.layerId)) continue;

        const key = wallGroup(element);
        const existing = wallsByGroup.get(key);

        if (existing === undefined) {
            wallsByGroup.set(key, [element]);
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

        if (element.type === 'wall' && wallsDrawn.has(wallGroup(element))) continue;

        if (element.type === 'wall') {
            wallsDrawn.add(wallGroup(element));
        }

        const primitives = primitivesFor(element, {
            lookup,
            openings,
            joins,
            wallsInGroup: (key) => wallsByGroup.get(key) ?? [],
            colour,
            palette: options.palette,
            overrideColor: options.overrideColor,
            unit: options.unit ?? 'm',
            scale: options.scale ?? 50,
            hatchFloor: options.minimumHatchSpacing ?? 0,
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
    /** Every wall painted as one shape: those sharing a layer and a fill. */
    wallsInGroup: (key: string) => readonly WallElement[];
    colour: string;
    palette: ScenePalette;
    overrideColor?: string | undefined;
    unit: DisplayUnit;
    /** The denominator of the plotted scale, which turns a sheet spacing into a world one. */
    scale: number;
    /** World millimetres below which a hatch is not worth drawing. */
    hatchFloor: number;
}

/** A wall is painted with the walls that share its layer and its fill, and with no others. */
function wallGroup(wall: WallElement): string {
    return `${wall.layerId}\u0000${wall.style?.hatch ?? ''}`;
}

function primitivesFor(element: Element, context: BuildContext): ScenePrimitive[] {
    switch (element.type) {
        case 'wall':
            return wallArea(context.wallsInGroup(wallGroup(element)), context);

        case 'line':
            return [
                {
                    kind: 'polyline',
                    points: elementWorldPoints(element, context.lookup),
                    closed: false,
                    stroke: shapeStroke(element, context),
                },
            ];

        case 'rect': {
            const ring = elementWorldPoints(element, context.lookup);

            return [
                {
                    kind: 'polyline',
                    points: ring,
                    closed: true,
                    stroke: shapeStroke(element, context),
                    fill: hatchFill(hatchOf(element), element.style?.fill ?? null, context),
                },
                ...closedHatch(element, [ring], context),
            ];
        }

        case 'cloud':
            /*
             * A chain of half circles rather than the run they are struck on: the run itself
             * is never drawn, because a cloud is a mark about the drawing and a closed outline
             * around part of a plan would read as something in it.
             */
            return cloudBumps(element).map((bump): ScenePrimitive => ({
                kind: 'arc',
                centre: bump.centre,
                radius: bump.radius,
                from: bump.from,
                to: bump.to,
                anticlockwise: bump.anticlockwise,
                stroke: pen(context.colour),
            }));

        case 'polygon': {
            const ring = elementWorldPoints(element, context.lookup);
            const shut = element.geometry.closed;

            return [
                {
                    kind: 'polyline',
                    points: ring,
                    closed: shut,
                    stroke: shapeStroke(element, context),
                    fill: shut
                        ? hatchFill(hatchOf(element), element.style?.fill ?? null, context)
                        : null,
                },
                // An open run encloses nothing, so there is nothing for a hatch to be inside.
                ...(shut ? closedHatch(element, [ring], context) : []),
            ];
        }

        case 'room': {
            const ring = elementWorldPoints(element, context.lookup);

            return [
                {
                    kind: 'polyline',
                    points: ring,
                    closed: true,
                    stroke: pen(context.colour),
                    fill: hatchFill(hatchOf(element), context.palette.roomFill, context),
                },
                ...closedHatch(element, [ring], context),
            ];
        }

        case 'circle': {
            const centre = { x: element.transform.x, y: element.transform.y };

            return [
                {
                    kind: 'circle',
                    centre,
                    radius: element.geometry.radius,
                    stroke: shapeStroke(element, context),
                    fill: hatchFill(hatchOf(element), element.style?.fill ?? null, context),
                },
                ...closedHatch(element, [ringOfCircle(centre, element.geometry.radius)], context),
            ];
        }

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
 * How many segments or specks one shape's hatch is allowed to cost.
 *
 * A wall at a sensible spacing is a few dozen. A site plan at the same spacing is tens of
 * thousands, and a drawing that stops responding is worse than one hatched coarser than asked
 * for — so past this the spacing is doubled until it fits, which is a thing the person can see
 * and correct rather than a freeze they cannot.
 */
const HATCH_LIMIT = 1500;

/**
 * What a hatch draws inside a shape.
 *
 * Geometry, never a fill pattern — see `geometry/hatch.ts` for why. The spacing arrives in
 * millimetres on the sheet, like a pen weight, and is multiplied up by the plotted scale here:
 * a concrete wall speckles the same on an A3 whether the plan goes out at 1:50 or at 1:100.
 *
 * The seed is the caller's, and it is what makes a stipple hold still. Everything scattered is
 * pseudo-random from it, so the same shape speckles identically on screen, in the PNG and in
 * the PDF, and does not shimmer as the drawing is panned.
 */
function hatchPrimitives(
    rings: readonly Point[][],
    pattern: HatchPattern,
    context: BuildContext,
    seed: number,
): ScenePrimitive[] {
    const hatch = findHatch(pattern);

    if (hatch === undefined || hatch.kind === 'solid' || hatch.kind === 'empty') {
        return [];
    }

    let spacing = hatch.spacing * context.scale;

    if (spacing <= 0 || spacing < context.hatchFloor) {
        return [];
    }

    let width = 0;
    let height = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const ring of rings) {
        for (const at of ring) {
            minX = Math.min(minX, at.x);
            minY = Math.min(minY, at.y);
            maxX = Math.max(maxX, at.x);
            maxY = Math.max(maxY, at.y);
        }
    }

    if (!Number.isFinite(minX)) {
        return [];
    }

    width = maxX - minX;
    height = maxY - minY;

    // Coarsened before anything is generated rather than after, so a big shape never builds the
    // hundred thousand segments it would have taken to find out they were too many.
    const cost = () =>
        hatch.kind === 'scatter'
            ? (width * height) / (spacing * spacing)
            : (width + height) / spacing;

    for (let step = 0; step < 8 && cost() > HATCH_LIMIT; step++) {
        spacing *= 2;
    }

    const stroke = pen(context.colour, PEN.fine);

    if (hatch.kind === 'scatter') {
        const radius = (hatch.dot ?? 0.1) * context.scale;

        return scatter(rings, spacing, HATCH_LIMIT, seed).map((at): ScenePrimitive => ({
            kind: 'circle',
            centre: at,
            radius,
            stroke: null,
            fill: context.colour,
        }));
    }

    const runs = clipLines(rings, hatch.angle, spacing, HATCH_LIMIT);

    if (hatch.kind === 'veins') {
        return wander(runs, spacing * (hatch.wander ?? 0.4), seed).map(
            (points): ScenePrimitive => ({ kind: 'polyline', points, closed: false, stroke }),
        );
    }

    return runs.map((run): ScenePrimitive => ({
        kind: 'polyline',
        points: [run.a, run.b],
        closed: false,
        stroke,
    }));
}

/** The hatch a closed shape carries, and the fill it is left with underneath it. */
function hatchOf(element: Element): HatchPattern | null {
    return element.style?.hatch ?? null;
}

/**
 * The stroke a shape somebody drew for its own sake is painted with.
 *
 * Its line type if it names one, and _contínua larga_ if it does not — which is exactly what a
 * line, a rectangle, a polygon and a circle were drawn as before there was a type to name, so
 * nothing already on a drawing moves. The weight arrives with the pattern rather than beside
 * it, because the standard names a line once: `tracejada estreita` is one convention and not a
 * dash crossed with a width.
 *
 * A wall, an opening, a room and a dimension are deliberately not asked. What those mean is
 * decided by what they are, and the weights the editor draws them at say so already.
 */
function shapeStroke(element: Element, context: BuildContext): Stroke {
    const definition = findLineType(element.style?.lineType ?? DEFAULT_LINE_TYPE);

    if (definition === undefined) {
        return pen(context.colour);
    }

    const stroke = pen(context.colour, LINE_WEIGHTS[definition.weight]);

    return definition.dash === null ? stroke : { ...stroke, dash: definition.dash };
}

/**
 * What fills a closed shape once its hatch has had its say.
 *
 * `demolish` is drawn open, which is the convention: masonry coming out is left white so that
 * what is staying reads solid beside it. Everything else that is not plain solid keeps the
 * paper behind it, because a hatch has to be read against something and a room's tint under a
 * concrete stipple is two marks fighting.
 */
function hatchFill(
    pattern: HatchPattern | null,
    fallback: string | null,
    context: BuildContext,
): string | null {
    if (pattern === null) {
        return fallback;
    }

    const hatch = findHatch(pattern);

    if (hatch === undefined || hatch.kind === 'solid') {
        return hatch?.kind === 'solid' ? context.colour : fallback;
    }

    return hatch.kind === 'empty' ? null : context.palette.sheet;
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
    const first = walls[0];

    if (rings.length === 0 || first === undefined) {
        return [];
    }

    const pattern = hatchOf(first);
    const hatch = pattern === null ? undefined : findHatch(pattern);

    // Solid is what a wall has always been, and what "existing masonry" means, so it is still
    // one filled shape with no outline: the wall *is* the black.
    if (hatch === undefined || hatch.kind === 'solid') {
        return [{ kind: 'area', rings, fill: context.colour, stroke: null }];
    }

    /*
     * Anything else is an outlined band with the pattern inside it. The outline comes from
     * stroking the same rings, which means a run of walls shows the mitre between one and the
     * next — merging them into one boundary needs a polygon union this has no call for
     * anywhere else, and a joint line is a smaller wrong than a hatch with no edge round it.
     */
    return [
        { kind: 'area', rings, fill: context.palette.sheet, stroke: pen(context.colour) },
        ...(pattern === null
            ? []
            : hatchPrimitives(rings, pattern, context, seedFrom(wallGroup(first)))),
    ];
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

/** The hatch inside one closed element, seeded from the element so it never shimmers. */
function closedHatch(
    element: Element,
    rings: readonly Point[][],
    context: BuildContext,
): ScenePrimitive[] {
    const pattern = hatchOf(element);

    return pattern === null ? [] : hatchPrimitives(rings, pattern, context, seedFrom(element.id));
}

/** A circle as a ring, because a hatch is clipped to edges and a circle has none. */
function ringOfCircle(centre: Point, radius: number): Point[] {
    const steps = 64;
    const ring: Point[] = [];

    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * TAU;

        ring.push({
            x: centre.x + Math.cos(angle) * radius,
            y: centre.y + Math.sin(angle) * radius,
        });
    }

    return ring;
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

/**
 * A door, drawn as whatever it operates like.
 *
 * The jambs are the hole and belong to every kind. What goes in the hole comes from the two
 * functions in `model/elements.ts` that the extent reads as well: the leaves that swing, and
 * the straight runs everything else is drawn as. A gate swings like a door and is drawn at the
 * fine pen, because a gate is a frame in a boundary rather than a slab in a partition.
 */
function doorPrimitives(element: DoorElement, context: BuildContext): ScenePrimitive[] {
    const frame = hostedFrame(element, context.lookup);

    if (frame === null) {
        return [];
    }

    const leafPen = pen(context.colour, element.geometry.leaf === 'gate' ? PEN.fine : PEN.normal);
    const arcPen = pen(context.overrideColor ?? context.palette.subtle, PEN.fine);

    const leaves = doorSwings(element, frame).flatMap((swing): ScenePrimitive[] => {
        const from = Math.atan2(swing.openDirection.y, swing.openDirection.x);
        const to = Math.atan2(swing.towardsOtherJamb.y, swing.towardsOtherJamb.x);

        return [
            {
                kind: 'polyline',
                points: [swing.hinge, add(swing.hinge, scale(swing.openDirection, swing.radius))],
                closed: false,
                stroke: leafPen,
            },
            {
                kind: 'arc',
                centre: swing.hinge,
                radius: swing.radius,
                from,
                to,
                anticlockwise: (to - from + TAU) % TAU > Math.PI,
                stroke: arcPen,
            },
        ];
    });

    const runs = openingRuns(element, frame).map((run): ScenePrimitive => ({
        kind: 'polyline',
        points: run.points,
        closed: false,
        stroke: run.dashed
            ? { ...pen(context.colour, PEN.fine), dash: [2, 1.5] }
            : pen(context.colour),
    }));

    return [...jambs(element, context), ...leaves, ...runs];
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
