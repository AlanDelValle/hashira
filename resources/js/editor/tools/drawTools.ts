import { snapAngle, toRadians } from '@/editor/geometry/angle';
import { addElements } from '@/editor/commands/command';
import {
    add,
    angleBetween,
    distance,
    equals,
    point,
    scale,
    type Point,
} from '@/editor/geometry/vec';
import {
    createCircle,
    createCloud,
    createLine,
    createPolygon,
    createRect,
} from '@/editor/model/factories';
import { setLineType } from '@/editor/model/edits';
import type { Element } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction, previewOne } from '@/editor/store/interaction';

import type { Tool, ToolContext, ToolEvent } from './types';

/**
 * The drawing tools.
 *
 * Line, rectangle and circle are press–drag–release; the polygon collects clicks until it is
 * told to stop. All of them build the preview with the same factory that commits the result,
 * so what is on screen while drawing is exactly what lands in the document.
 */

/** Shift holds a line to these increments. */
const ANGLE_SNAP = toRadians(15);

/** Anything smaller than this in world millimetres is a stray click, not a shape. */
const MINIMUM_SIZE = 1;

/**
 * The shape, drawn as the line type the tool is set to.
 *
 * Applied to the preview as well as to the committed element, because they come out of the
 * same factory: a centre line rubber-bands as a centre line, which is the only way to see
 * before letting go that the right one is selected.
 */
function typed<T extends Element | null>(element: T): T {
    return element === null
        ? element
        : (setLineType(element, useEditorStore.getState().lineType) as T);
}

function constrainToAngle(origin: Point, target: Point): Point {
    const angle = snapAngle(angleBetween(origin, target), ANGLE_SNAP);
    const length = distance(origin, target);

    return add(origin, scale(point(Math.cos(angle), Math.sin(angle)), length));
}

/** After committing, hand the drawing back to the select tool with the result selected. */
function finish(ids: string[]): void {
    const store = useEditorStore.getState();

    store.select(ids);
    store.setTool('select');
}

function clearDraft(): void {
    previewOne(null);
    interaction.draftPoints = [];
    requestRepaint();
}

type DragBuilder = (origin: Point, current: Point, layerId: string) => Element | null;

/** Line, rectangle and circle differ only in what they build from two points. */
function createDragTool(id: 'line' | 'rect' | 'circle', label: string, build: DragBuilder): Tool {
    let origin: Point | null = null;

    function update(event: ToolEvent, context: ToolContext): void {
        if (origin === null) {
            return;
        }

        const target =
            id === 'line' && event.shift ? constrainToAngle(origin, event.world) : event.world;

        previewOne(build(origin, target, context.activeLayerId));
        requestRepaint();
    }

    return {
        id,
        cursor: 'crosshair',

        onPointerDown(event) {
            origin = event.world;
            previewOne(null);
        },

        onPointerMove(event, context) {
            update(event, context);
        },

        onPointerUp(event, context) {
            if (origin === null) {
                return;
            }

            update(event, context);

            const [element] = interaction.preview;
            const start = origin;

            origin = null;
            clearDraft();

            if (element === undefined || distance(start, event.world) < MINIMUM_SIZE) {
                return;
            }

            runCommand(addElements([element], label));
            finish([element.id]);
        },

        cancel() {
            origin = null;
            clearDraft();
        },
    };
}

export function createLineTool(): Tool {
    return createDragTool('line', 'Line', (origin, current, layerId) =>
        typed(createLine(origin, current, layerId)),
    );
}

export function createRectTool(): Tool {
    return createDragTool('rect', 'Rectangle', (origin, current, layerId) => {
        if (
            Math.abs(current.x - origin.x) < MINIMUM_SIZE ||
            Math.abs(current.y - origin.y) < MINIMUM_SIZE
        ) {
            return null;
        }

        return typed(createRect(origin, current, layerId));
    });
}

export function createCircleTool(): Tool {
    return createDragTool('circle', 'Circle', (origin, current, layerId) => {
        const radius = distance(origin, current);

        return radius < MINIMUM_SIZE ? null : typed(createCircle(origin, radius, layerId));
    });
}

/**
 * The polygon collects vertices one click at a time. Clicking the first vertex again closes
 * the ring; Enter or a double click finishes it open; Escape throws it away.
 */
export function createPolygonTool(): Tool {
    let vertices: Point[] = [];

    function preview(context: ToolContext, cursor: Point | null, closed: boolean): void {
        const points = cursor === null ? vertices : [...vertices, cursor];

        interaction.draftPoints = vertices;
        previewOne(
            points.length >= 2 ? typed(createPolygon(points, closed, context.activeLayerId)) : null,
        );

        requestRepaint();
    }

    function commit(context: ToolContext, closed: boolean): void {
        const element =
            vertices.length >= 2
                ? typed(createPolygon(vertices, closed, context.activeLayerId))
                : null;

        vertices = [];
        clearDraft();

        if (element === null) {
            return;
        }

        runCommand(addElements([element], 'Polygon'));
        finish([element.id]);
    }

    return {
        id: 'polygon',
        cursor: 'crosshair',

        onPointerDown(event, context) {
            const first = vertices[0];

            if (
                first !== undefined &&
                vertices.length >= 3 &&
                equals(event.world, first, context.tolerance)
            ) {
                commit(context, true);

                return;
            }

            vertices = [...vertices, event.world];
            preview(context, null, false);
        },

        onPointerMove(event, context) {
            if (vertices.length === 0) {
                return;
            }

            preview(context, event.world, false);
        },

        onDoubleClick(_event, context) {
            commit(context, false);
        },

        onKeyDown(key, context) {
            if (key === 'Enter') {
                commit(context, false);

                return true;
            }

            return false;
        },

        cancel() {
            vertices = [];
            clearDraft();
        },
    };
}

/**
 * The revision cloud, collected the same way a polygon is and always closed.
 *
 * A cloud says "this part changed", and a part has an edge all the way round — so Enter and a
 * double click close it rather than leaving it open, and three points is the least that
 * surrounds anything.
 */
export function createCloudTool(): Tool {
    let vertices: Point[] = [];

    function radius(): number {
        return useEditorStore.getState().cloudRadius;
    }

    function preview(context: ToolContext, cursor: Point | null): void {
        const points = cursor === null ? vertices : [...vertices, cursor];

        interaction.draftPoints = vertices;
        previewOne(
            points.length >= 3 ? createCloud(points, context.activeLayerId, radius()) : null,
        );

        requestRepaint();
    }

    function commit(context: ToolContext): void {
        const element =
            vertices.length >= 3 ? createCloud(vertices, context.activeLayerId, radius()) : null;

        vertices = [];
        clearDraft();

        if (element === null) {
            return;
        }

        runCommand(addElements([element], 'Revision cloud'));
        finish([element.id]);
    }

    return {
        id: 'cloud',
        cursor: 'crosshair',

        onPointerDown(event, context) {
            const first = vertices[0];

            if (
                first !== undefined &&
                vertices.length >= 3 &&
                equals(event.world, first, context.tolerance)
            ) {
                commit(context);

                return;
            }

            vertices = [...vertices, event.world];
            preview(context, null);
        },

        onPointerMove(event, context) {
            if (vertices.length === 0) {
                return;
            }

            preview(context, event.world);
        },

        onDoubleClick(_event, context) {
            commit(context);
        },

        onKeyDown(key, context) {
            if (key === 'Enter') {
                commit(context);

                return true;
            }

            return false;
        },

        cancel() {
            vertices = [];
            clearDraft();
        },
    };
}
