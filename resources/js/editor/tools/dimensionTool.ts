import { addElements } from '@/editor/commands/command';
import { dot, normalize, perpendicular, subtract, type Point } from '@/editor/geometry/vec';
import { createDimension } from '@/editor/model/factories';
import type { HashiraDocument } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';

import type { Tool, ToolContext } from './types';

/**
 * Measuring.
 *
 * Three clicks, because a dimension is three decisions: what to measure from, what to measure
 * to, and which side of it the measurement is written on. The first two land through the
 * ordinary snap engine — endpoints and intersections are exactly what anyone wants to
 * dimension between — and the third is read off the pointer as a signed offset, so the line
 * can be pulled out to either side.
 *
 * The value is not one of the decisions. It is read off the two points every time the
 * dimension is drawn, so a measurement cannot come to disagree with what it measures.
 */
export function createDimensionTool(): Tool {
    let from: Point | null = null;
    let to: Point | null = null;

    function clearDraft(): void {
        interaction.preview = null;
        interaction.draftPoints = [];
        requestRepaint();
    }

    function reset(): void {
        from = null;
        to = null;
        clearDraft();
    }

    function build(offset: number, context: ToolContext) {
        if (from === null || to === null) {
            return null;
        }

        return createDimension(
            from,
            to,
            offset,
            dimensionLayer(context.drawing, context.activeLayerId),
            useEditorStore.getState().dimensionSize,
        );
    }

    function commit(offset: number, context: ToolContext): void {
        const element = build(offset, context);

        if (element === null) {
            return;
        }

        runCommand(addElements([element], 'Dimension'));
        useEditorStore.getState().select([element.id]);
    }

    return {
        id: 'dimension',
        cursor: 'crosshair',

        onPointerMove(event, context) {
            if (from === null) {
                return;
            }

            if (to === null) {
                // Between the first and second click there is no offset to show yet, so the
                // draft is the measurement being stretched out.
                interaction.draftPoints = [from, event.world];

                return;
            }

            interaction.preview = build(offsetTowards(from, to, event.world), context);
        },

        onPointerDown(event, context) {
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
                interaction.preview = build(0, context);

                return;
            }

            commit(offsetTowards(from, to, event.world), context);
            reset();
        },

        onKeyDown(key, context) {
            // Enter settles for the measurement written on the line itself.
            if (key === 'Enter' && from !== null && to !== null) {
                commit(0, context);
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
        from,
        to,
        offset,
        dimensionLayer(drawing, store.activeLayerId),
        store.dimensionSize,
    );

    runCommand(addElements([element], 'Dimension'));
    store.select([element.id]);

    return element.id;
}
