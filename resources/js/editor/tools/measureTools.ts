import { addElements, replaceElements } from '@/editor/commands/command';
import {
    angleBetween,
    dot,
    normalize,
    perpendicular,
    subtract,
    type Point,
} from '@/editor/geometry/vec';
import { setDimensionPoints } from '@/editor/model/edits';
import { elementWorldPoints, makeLookup } from '@/editor/model/elements';
import { createAngle, createDimension, createRadius } from '@/editor/model/factories';
import { pickAt } from '@/editor/model/picking';
import type { CircleElement, DimensionElement, HashiraDocument } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction, previewOne } from '@/editor/store/interaction';

import type { Tool, ToolContext, ToolEvent } from './types';

/**
 * Measuring.
 *
 * Three tools, one rule: a measurement stores what it measures and never the number it came
 * to. A length is read off its points, an angle off its two legs, a radius off the circle it
 * is hosted on — so a measurement cannot come to disagree with the drawing it is written on,
 * and there is deliberately nowhere to type a value over any of them.
 */

/** A dimension resolves its own points; nothing it reads needs to be looked up. */
const empty = makeLookup([]);

function clearDraft(): void {
    previewOne(null);
    interaction.draftPoints = [];
    requestRepaint();
}

/**
 * A length, in three clicks — what to measure from, what to measure to, and which side of it
 * the value is written on. The first two land through the ordinary snap engine, since
 * endpoints and intersections are exactly what anyone wants to dimension between, and the
 * third is read off the pointer as a signed offset so the line can be pulled out either way.
 *
 * Three clicks and it is finished. Holding Shift on that third one keeps the run live instead,
 * and each further click carries it on to another point: one dimension line, a value for each
 * step along it, and the parts adding up to the whole because they are parts of one mark
 * rather than a row of separate ones. Enter, Escape or a double click ends it.
 *
 * Chaining was the default for a while, and it was wrong. The measurement was committed on the
 * third click and the tool stayed live, so the next click — meant for a new measurement
 * somewhere else — silently carried the old one across the drawing instead. A tool that says
 * three clicks has to be finished after three clicks; a chain is the rarer thing and asks for
 * the extra key.
 */
export function createDimensionTool(): Tool {
    let from: Point | null = null;
    let to: Point | null = null;
    /** The committed measurement a further click carries on. */
    let chain: DimensionElement | null = null;

    function reset(): void {
        from = null;
        to = null;
        chain = null;
        clearDraft();
    }

    function build(offset: number, context: ToolContext) {
        if (from === null || to === null) {
            return null;
        }

        return createDimension(
            [from, to],
            offset,
            dimensionLayer(context.drawing, context.activeLayerId),
            useEditorStore.getState().dimensionSize,
        );
    }

    function commit(offset: number, context: ToolContext, carryOn: boolean): void {
        const element = build(offset, context);

        if (element === null) {
            return;
        }

        runCommand(addElements([element], 'Dimension'));
        useEditorStore.getState().select([element.id]);

        // Live only when asked for. Otherwise the next click is a new measurement, which is
        // what three clicks and a finished mark imply.
        chain = carryOn ? element : null;
        from = null;
        to = null;
        clearDraft();
    }

    /** Carry the live measurement on to one more point. */
    function extend(at: Point, preview: boolean): void {
        if (chain === null) {
            return;
        }

        const extended = setDimensionPoints(chain, [...elementWorldPoints(chain, empty), at]);

        if (extended.type !== 'dimension') {
            return;
        }

        if (preview) {
            previewOne(extended);
            requestRepaint();

            return;
        }

        runCommand(replaceElements([chain], [extended], 'Dimension'));
        useEditorStore.getState().select([extended.id]);
        chain = extended;
        clearDraft();
    }

    return {
        id: 'dimension',
        cursor: 'crosshair',

        onPointerMove(event, context) {
            if (chain !== null) {
                extend(event.world, true);

                return;
            }

            if (from === null) {
                return;
            }

            if (to === null) {
                // Between the first and second click there is no offset to show yet, so the
                // draft is the measurement being stretched out.
                interaction.draftPoints = [from, event.world];

                return;
            }

            previewOne(build(offsetTowards(from, to, event.world), context));
        },

        onPointerDown(event, context) {
            if (chain !== null) {
                extend(event.world, false);

                return;
            }

            if (from === null) {
                from = event.world;
                interaction.draftPoints = [from];

                return;
            }

            if (to === null) {
                // Two clicks in the same place is a slip, not a measurement of nothing.
                if (event.world.x === from.x && event.world.y === from.y) {
                    return;
                }

                to = event.world;
                previewOne(build(0, context));

                return;
            }

            commit(offsetTowards(from, to, event.world), context, event.shift);
        },

        onDoubleClick() {
            // The second click of a double click has already carried the chain on; ending it
            // here is what stops a slip from adding a measurement of nothing.
            if (chain !== null) {
                reset();
            }
        },

        onKeyDown(key, context) {
            if (key !== 'Enter') {
                return false;
            }

            // Enter ends a chain, or settles for the measurement written on the line itself.
            if (chain !== null) {
                reset();

                return true;
            }

            if (from !== null && to !== null) {
                commit(0, context, false);
                reset();

                return true;
            }

            return false;
        },

        /** The first point is what an alignment guide should run from while placing the second. */
        anchors: () => (from === null ? [] : [from]),

        cancel: reset,
    };
}

/**
 * An angle, in three clicks: the corner, then a point along each of its two legs.
 *
 * The legs are recorded as points rather than as an angle, so the measurement is of two
 * directions in the drawing rather than of a number somebody once read off it. How far out the
 * arc is struck follows from the shorter leg, and is a property like any other afterwards.
 */
export function createAngleTool(): Tool {
    let vertex: Point | null = null;
    let first: Point | null = null;

    function reset(): void {
        vertex = null;
        first = null;
        clearDraft();
    }

    function build(second: Point, context: ToolContext) {
        return vertex === null || first === null
            ? null
            : createAngle(
                  vertex,
                  first,
                  second,
                  dimensionLayer(context.drawing, context.activeLayerId),
                  useEditorStore.getState().dimensionSize,
              );
    }

    return {
        id: 'angle',
        cursor: 'crosshair',

        onPointerMove(event, context) {
            if (vertex === null) {
                return;
            }

            if (first === null) {
                interaction.draftPoints = [vertex, event.world];

                return;
            }

            previewOne(build(event.world, context));
            requestRepaint();
        },

        onPointerDown(event, context) {
            if (vertex === null) {
                vertex = event.world;
                interaction.draftPoints = [vertex];

                return;
            }

            if (first === null) {
                if (event.world.x === vertex.x && event.world.y === vertex.y) {
                    return;
                }

                first = event.world;
                interaction.draftPoints = [vertex, first];

                return;
            }

            const element = build(event.world, context);

            reset();

            if (element === null) {
                return;
            }

            runCommand(addElements([element], 'Angle'));

            const store = useEditorStore.getState();
            store.select([element.id]);
            store.setTool('select');
        },

        anchors: () => (vertex === null ? [] : first === null ? [vertex] : [vertex, first]),

        cancel: reset,
    };
}

/**
 * A radius, in one click on the circle it measures.
 *
 * Where the click landed decides which way the leader points, and nothing else needs
 * deciding: the value is the circle's own radius. Away from a circle the tool does nothing at
 * all — a radius with nothing to be the radius of is not a thing this format can express, so
 * offering to create one would be offering a lie.
 */
export function createRadiusTool(): Tool {
    function circleUnder(event: ToolEvent, context: ToolContext): CircleElement | null {
        const hit = pickAt(context.drawing, event.rawWorld, context.tolerance);

        return hit !== null && hit.type === 'circle' ? hit : null;
    }

    function build(event: ToolEvent, context: ToolContext) {
        const host = circleUnder(event, context);

        return host === null
            ? null
            : createRadius(
                  host.id,
                  angleBetween({ x: host.transform.x, y: host.transform.y }, event.rawWorld),
                  dimensionLayer(context.drawing, context.activeLayerId),
                  false,
                  useEditorStore.getState().dimensionSize,
              );
    }

    return {
        id: 'radius',
        cursor: 'crosshair',

        onPointerMove(event, context) {
            const host = circleUnder(event, context);
            const hovered = host?.id ?? null;

            if (interaction.hoveredId !== hovered) {
                interaction.hoveredId = hovered;
            }

            previewOne(build(event, context));
            requestRepaint();
        },

        onPointerDown(event, context) {
            const element = build(event, context);

            if (element === null) {
                return;
            }

            clearDraft();
            runCommand(addElements([element], 'Radius'));

            const store = useEditorStore.getState();
            store.select([element.id]);
            store.setTool('select');
        },

        cancel() {
            interaction.hoveredId = null;
            clearDraft();
        },
    };
}

/**
 * How far the pointer sits from the measured line, along the perpendicular.
 *
 * Only that component is used, so the dimension line follows the pointer out to whichever
 * side it is on and ignores movement along the measurement — which is not a direction it can
 * be pulled in.
 */
function offsetTowards(from: Point, to: Point, at: Point): number {
    return dot(subtract(at, from), perpendicular(normalize(subtract(to, from))));
}

/** Measurements belong on the dimensions layer when it exists, not on whatever is active. */
export function dimensionLayer(drawing: HashiraDocument, activeLayerId: string): string {
    return drawing.layers.some((layer) => layer.id === 'layer_dimensions')
        ? 'layer_dimensions'
        : activeLayerId;
}

/** Commits a measurement outside a pointer sequence — used by the tests and the seed path. */
export function commitDimension(from: Point, to: Point, offset: number): string | null {
    const store = useEditorStore.getState();
    const drawing = useDocumentStore.getState().document;

    if (from.x === to.x && from.y === to.y) {
        return null;
    }

    const element = createDimension(
        [from, to],
        offset,
        dimensionLayer(drawing, store.activeLayerId),
        store.dimensionSize,
    );

    runCommand(addElements([element], 'Dimension'));
    store.select([element.id]);

    return element.id;
}
