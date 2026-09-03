import { addElements } from '@/editor/commands/command';
import { clamp, type Point } from '@/editor/geometry/vec';
import { createWall } from '@/editor/model/factories';
import type { WallElement } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';

import type { Tool, ToolContext } from './types';

/**
 * A room drawn from the area it has to have.
 *
 * Every other tool here is told a size and draws it. This one is told an *area* and is left to
 * find a size: you say twelve square metres, put a corner down, and the rectangle that follows
 * the pointer holds those twelve metres while its proportion changes. Dragging does not make it
 * bigger — it makes it a different shape of the same size, which is the whole point, because
 * "twelve square metres" is the requirement and 3.00 × 4.00 or 2.40 × 5.00 is the decision.
 *
 * What lands in the drawing is four walls. Nothing records that an area was asked for: the
 * request is an input, and the area the room actually has is measured off the walls afterwards
 * like any other value on the sheet. That is also why the rounding below is not hidden — if
 * the grid turns 3.464 into 3.500, the readout says 3.500 before the click, not after.
 */

/**
 * How far from square the rectangle is allowed to be pushed.
 *
 * A guard rather than a preference: the proportion comes from dividing one pointer offset by
 * the other, and a pointer on the same row as the corner it started from would otherwise ask
 * for a room of infinite length. Twenty to one is already a corridor.
 */
const ASPECT_LIMIT = 20;

/** The inside of a room: the space itself, before the walls are put round it. */
export interface RoomRectangle {
    /** The corner the room was started from. */
    from: Point;
    /** The corner opposite it. */
    to: Point;
    width: number;
    height: number;
}

/**
 * The rectangle of a given area, in the proportion the pointer is asking for.
 *
 * The pointer decides the shape and the direction, never the size: the far corner slides along
 * the ray out of the anchor as the proportion changes, and pushing further out along the same
 * ray does nothing at all. A rectangle that visibly refuses to grow is how the tool says the
 * area is locked without a word of interface.
 *
 * `step` rounds the two sides — the grid, when it is on. It rounds the *inside* dimensions
 * rather than the wall centrelines, because the inside is what was asked for and what gets
 * dimensioned on the sheet; a wall centreline landing on a round number is nobody's
 * requirement. The area that comes out is therefore not exactly the area that went in, which
 * is why nothing here reports the request back.
 */
export function roomFromArea(
    anchor: Point,
    pointer: Point,
    area: number,
    step: number,
): RoomRectangle {
    const dx = pointer.x - anchor.x;
    const dy = pointer.y - anchor.y;

    const aspect = clamp(
        Math.abs(dx) / Math.max(Math.abs(dy), Number.EPSILON),
        1 / ASPECT_LIMIT,
        ASPECT_LIMIT,
    );

    const raw = Math.sqrt(Math.max(area, 0) * aspect);
    const width = round(raw, step);
    const height = round(raw === 0 ? 0 : area / raw, step);

    const from = anchor;
    const to = {
        x: anchor.x + Math.sign(dx || 1) * width,
        y: anchor.y + Math.sign(dy || 1) * height,
    };

    return { from, to, width, height };
}

/** To the nearest step, never to nothing: a room rounded away is not a room. */
function round(value: number, step: number): number {
    if (step <= 0) {
        return value;
    }

    return Math.max(Math.round(value / step), 1) * step;
}

/**
 * The four walls round a room.
 *
 * The rectangle is the *inside*, so every centreline sits half a thickness outside it and the
 * corners meet where the centrelines cross — which is what leaves the four bands mitring into
 * one another rather than overlapping. Drawn as a closed chain so that each corner is one
 * point shared by two walls, which is the tolerance the joins are found within.
 */
export function roomWalls(room: RoomRectangle, thickness: number, layerId: string): WallElement[] {
    const half = thickness / 2;
    const minX = Math.min(room.from.x, room.to.x) - half;
    const maxX = Math.max(room.from.x, room.to.x) + half;
    const minY = Math.min(room.from.y, room.to.y) - half;
    const maxY = Math.max(room.from.y, room.to.y) + half;

    const corners: Point[] = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
    ];

    return corners.map((corner, index) =>
        createWall(corner, corners[(index + 1) % corners.length] ?? corner, layerId, thickness),
    );
}

export function createAreaTool(): Tool {
    let anchor: Point | null = null;

    function clear(): void {
        anchor = null;
        interaction.preview = [];
        interaction.draftPoints = [];
        requestRepaint();
    }

    function walls(at: Point, context: ToolContext): WallElement[] {
        const store = useEditorStore.getState();
        const grid = context.drawing.settings.grid;
        const step = store.snapToGrid && grid.snap ? grid.size : 0;

        if (anchor === null) {
            return [];
        }

        return roomWalls(
            roomFromArea(anchor, at, store.targetArea, step),
            store.wallThickness,
            context.activeLayerId,
        );
    }

    return {
        id: 'area',
        cursor: 'crosshair',

        anchors: () => (anchor === null ? [] : [anchor]),

        onPointerDown(event, context) {
            if (anchor === null) {
                anchor = event.world;
                interaction.draftPoints = [anchor];
                requestRepaint();

                return;
            }

            // The proportion comes from where the pointer actually is, not from where a snap
            // would have put it: a grid line 20 mm away is not a request for a different shape
            // of room. The corner the room started from was snapped, which is the point that
            // wants to land on something.
            const room = walls(event.rawWorld, context);

            clear();

            if (room.length === 0) {
                return;
            }

            runCommand(addElements(room, 'Room'));

            const store = useEditorStore.getState();
            store.select(room.map((wall) => wall.id));
            store.setTool('select');
        },

        onPointerMove(event, context) {
            if (anchor === null) {
                return;
            }

            interaction.preview = walls(event.rawWorld, context);
            requestRepaint();
        },

        onKeyDown(key) {
            if (key === 'Enter' && anchor !== null) {
                clear();

                return true;
            }

            return false;
        },

        cancel: clear,
    };
}
