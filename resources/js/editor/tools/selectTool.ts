import { snapAngle, toRadians } from '@/editor/geometry/angle';
import { boundsCentre, boundsContainPoint, boundsFromCorners } from '@/editor/geometry/bbox';
import { angleBetween, distance, subtract, type Point } from '@/editor/geometry/vec';
import { replaceElements } from '@/editor/commands/command';
import { elementWorldPoints, rotateElement, translateElement } from '@/editor/model/elements';
import { pickAt, pickInBounds } from '@/editor/model/picking';
import type { Element } from '@/editor/model/types';
import { runCommand } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';
import { requestRepaint } from '@/editor/render/frame';
import { rotateHandlePosition, rotateHandleRadius, selectionBounds } from '@/editor/render/overlay';
import { snapTranslation } from '@/editor/snapping/translate';

import type { Tool, ToolContext, ToolEvent } from './types';

/**
 * Select, move and rotate.
 *
 * The drag itself only ever writes to interaction state, so dragging fifty elements repaints
 * the canvas without re-rendering a single React component. One command is produced on
 * release, which is also what makes a drag a single undo step.
 */

/** Pointer travel before a press becomes a drag rather than a click, in screen pixels. */
const DRAG_THRESHOLD_PX = 3;

/** Shift while rotating holds to these increments. */
const ROTATE_SNAP = toRadians(15);

/**
 * How large a selection still snaps by its own geometry while it is dragged.
 *
 * Eight is a corner, a door and its wall, a room's worth of walls. Past that a drag is
 * arranging rather than connecting: nobody lines up forty elements by one of their corners,
 * and asking every corner of them where it would like to land costs a snap query each, on
 * every pointer move. Beyond it the pointer leads, as it always did.
 */
const SNAP_BY_GEOMETRY_LIMIT = 8;

/**
 * The points of a dragged selection that are worth landing exactly: every corner, endpoint and
 * centre the elements have. Empty for a selection too large to be aimed by one of them.
 */
function draggedPoints(before: readonly Element[], context: ToolContext): Point[] {
    if (before.length > SNAP_BY_GEOMETRY_LIMIT) {
        return [];
    }

    return before.flatMap((element) => elementWorldPoints(element, context.lookup));
}

function selectedElements(context: ToolContext): Element[] {
    const { selection } = useEditorStore.getState();

    return selection.flatMap((id) => {
        const element = context.lookup(id);

        return element === undefined ? [] : [element];
    });
}

function onRotateHandle(event: ToolEvent, context: ToolContext): boolean {
    const elements = selectedElements(context);

    if (elements.length === 0) {
        return false;
    }

    const bounds = selectionBounds(elements, context);

    if (bounds === null) {
        return false;
    }

    const px = 1 / context.viewport.zoom;
    const handle = rotateHandlePosition(bounds, px);

    // A little more generous than the drawn circle, because a 9-pixel target is a small one.
    return distance(event.rawWorld, handle) <= rotateHandleRadius(px) * 2.5;
}

function withinSelection(p: Point, context: ToolContext): boolean {
    const bounds = selectionBounds(selectedElements(context), context);

    return bounds !== null && boundsContainPoint(bounds, p);
}

export function createSelectTool(): Tool {
    let pressScreen: Point | null = null;

    function beginDrag(kind: 'move' | 'rotate', event: ToolEvent, context: ToolContext): void {
        const before = selectedElements(context);

        if (before.length === 0) {
            return;
        }

        interaction.drag = {
            kind,
            origin: event.world,
            originRaw: event.rawWorld,
            current: event.world,
            before,
            preview: before,
            engaged: false,
        };
    }

    function updateDrag(event: ToolEvent, context: ToolContext): void {
        const drag = interaction.drag;

        if (drag === null) {
            return;
        }

        drag.current = event.world;

        if (drag.kind === 'move') {
            const points = draggedPoints(drag.before, context);

            /*
             * Two ways to arrive at the same delta. With the selection's own points in hand it
             * is measured from the raw pointer and corrected by whichever of those points lands
             * on something, so the thing being moved is what snaps. Without them — too much
             * selected for that to mean anything — the pointer leads, snapped as ever.
             */
            const moved =
                points.length === 0
                    ? { delta: subtract(event.world, drag.origin), result: interaction.snap }
                    : snapTranslation(
                          points,
                          subtract(event.rawWorld, drag.originRaw),
                          context.snap,
                      );

            interaction.snap = moved.result;

            drag.preview = drag.before.map((element) =>
                translateElement(element, moved.delta, context.lookup),
            );

            return;
        }

        const bounds = selectionBounds(drag.before, context);

        if (bounds === null) {
            return;
        }

        const pivot = boundsCentre(bounds);
        const from = angleBetween(pivot, drag.origin);
        const to = angleBetween(pivot, event.rawWorld);
        const raw = to - from;
        const angle = event.shift ? snapAngle(raw, ROTATE_SNAP) : raw;

        drag.preview = drag.before.map((element) =>
            rotateElement(element, pivot, angle, context.lookup),
        );
    }

    function commitDrag(): void {
        const drag = interaction.drag;

        interaction.drag = null;

        if (drag === null || !drag.engaged) {
            return;
        }

        runCommand(
            replaceElements(
                drag.before,
                drag.preview,
                drag.kind === 'move' ? 'Move' : 'Rotate',
                null,
            ),
        );
    }

    return {
        id: 'select',
        cursor: 'default',

        // While a selection is being dragged its own geometry is meaningless as a snap target,
        // and would pin the drag to where it started.
        snapExclusions: () => new Set(interaction.drag?.before.map((element) => element.id) ?? []),

        onPointerDown(event, context) {
            pressScreen = event.screen;

            if (onRotateHandle(event, context)) {
                beginDrag('rotate', event, context);

                return;
            }

            const hit = pickAt(context.drawing, event.rawWorld, context.tolerance);
            const store = useEditorStore.getState();

            if (hit === null) {
                // Picking is on the outline, which would make an already-selected shape
                // impossible to grab by its middle. Once something is selected, anywhere
                // inside its extent is a handle for moving it.
                if (!event.shift && withinSelection(event.rawWorld, context)) {
                    beginDrag('move', event, context);

                    return;
                }

                if (!event.shift) {
                    store.clearSelection();
                }

                interaction.marquee = { from: event.rawWorld, to: event.rawWorld, mode: 'window' };

                return;
            }

            if (event.shift) {
                store.toggleInSelection(hit.id);
            } else if (!store.selection.includes(hit.id)) {
                store.select([hit.id]);
            }

            beginDrag('move', event, context);
        },

        onPointerMove(event, context) {
            if (interaction.marquee !== null) {
                interaction.marquee = {
                    from: interaction.marquee.from,
                    to: event.rawWorld,
                    // Left-to-right catches only what is fully enclosed; right-to-left catches
                    // anything the band touches.
                    mode: event.rawWorld.x >= interaction.marquee.from.x ? 'window' : 'crossing',
                };

                requestRepaint();

                return;
            }

            if (interaction.drag !== null) {
                if (!interaction.drag.engaged && pressScreen !== null) {
                    interaction.drag.engaged =
                        distance(pressScreen, event.screen) > DRAG_THRESHOLD_PX;
                }

                if (interaction.drag.engaged) {
                    updateDrag(event, context);
                    requestRepaint();
                }

                return;
            }

            const hovered = pickAt(context.drawing, event.rawWorld, context.tolerance);

            if (interaction.hoveredId !== (hovered?.id ?? null)) {
                interaction.hoveredId = hovered?.id ?? null;
                requestRepaint();
            }
        },

        onPointerUp(event, context) {
            const marquee = interaction.marquee;

            if (marquee !== null) {
                interaction.marquee = null;

                const bounds = boundsFromCorners(marquee.from, marquee.to);
                const caught = pickInBounds(context.drawing, bounds, marquee.mode);
                const store = useEditorStore.getState();
                const ids = caught.map((element) => element.id);

                // Shift adds to what is already selected, the way it does for a single click.
                store.select(event.shift ? [...new Set([...store.selection, ...ids])] : ids);
            }

            commitDrag();
            pressScreen = null;
            requestRepaint();
        },

        cancel() {
            interaction.drag = null;
            interaction.marquee = null;
            pressScreen = null;
            requestRepaint();
        },
    };
}
