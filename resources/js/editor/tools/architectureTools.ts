import { addElements } from '@/editor/commands/command';
import { distance, type Point } from '@/editor/geometry/vec';
import { parameterAlongSegment } from '@/editor/geometry/segment';
import { findAsset } from '@/editor/assets/library';
import {
    createAsset,
    createDoor,
    createRoom,
    createWall,
    createWindow,
} from '@/editor/model/factories';
import { wallSegment } from '@/editor/model/elements';
import { pickAt } from '@/editor/model/picking';
import type { Element, WallElement } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { runCommand } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';

import type { Tool, ToolContext, ToolEvent } from './types';

/**
 * The tools that draw a building rather than a shape.
 *
 * They share the drawing tools' contract — preview into interaction state, one command on
 * completion — and add the thing that makes them architectural: they know what they are
 * attaching to. An opening is placed *on a wall*, at a distance along it, not at a coordinate
 * that happens to sit near one.
 */

const MINIMUM_LENGTH = 1;

function clearDraft(): void {
    interaction.preview = null;
    interaction.draftPoints = [];
    requestRepaint();
}

/**
 * Walls are drawn as a chain: each click ends one wall and starts the next from that same
 * corner, which is how a room gets drawn without re-picking every junction.
 */
export function createWallTool(): Tool {
    let start: Point | null = null;

    return {
        id: 'wall',
        cursor: 'crosshair',

        anchors: () => (start === null ? [] : [start]),

        onPointerDown(event, context) {
            if (start === null) {
                start = event.world;
                interaction.draftPoints = [start];
                requestRepaint();

                return;
            }

            if (distance(start, event.world) >= MINIMUM_LENGTH) {
                const wall = createWall(
                    start,
                    event.world,
                    context.activeLayerId,
                    useEditorStore.getState().wallThickness,
                );

                runCommand(addElements([wall], 'Wall'));
                start = event.world;
                interaction.draftPoints = [start];
            }

            requestRepaint();
        },

        onPointerMove(event, context) {
            if (start === null) {
                return;
            }

            interaction.preview =
                distance(start, event.world) < MINIMUM_LENGTH
                    ? null
                    : createWall(
                          start,
                          event.world,
                          context.activeLayerId,
                          useEditorStore.getState().wallThickness,
                      );

            requestRepaint();
        },

        onDoubleClick() {
            start = null;
            clearDraft();
        },

        onKeyDown(key) {
            if (key === 'Enter' && start !== null) {
                start = null;
                clearDraft();

                return true;
            }

            return false;
        },

        cancel() {
            start = null;
            clearDraft();
        },
    };
}

/** The wall under the pointer, and how far along it the pointer is. */
function wallUnder(
    event: ToolEvent,
    context: ToolContext,
): { wall: WallElement; offset: number } | null {
    const hit = pickAt(context.drawing, event.rawWorld, context.tolerance);

    if (hit === null || hit.type !== 'wall') {
        return null;
    }

    const segment = wallSegment(hit);
    const length = distance(segment.a, segment.b);
    const offset = parameterAlongSegment(segment, event.rawWorld) * length;

    return { wall: hit, offset };
}

/**
 * Doors and windows are placed by clicking the wall they belong to. Away from a wall the tool
 * does nothing at all — an opening with no host is not a thing this format can express, so
 * offering to create one would be offering a lie.
 */
function createOpeningTool(
    id: 'door' | 'window',
    label: string,
    build: (hostId: string, offset: number, layerId: string) => Element,
): Tool {
    return {
        id,

        cursor: 'crosshair',

        onPointerMove(event, context) {
            const target = wallUnder(event, context);
            const hovered = target?.wall.id ?? null;

            if (interaction.hoveredId !== hovered) {
                interaction.hoveredId = hovered;
                requestRepaint();
            }

            interaction.preview =
                target === null
                    ? null
                    : build(target.wall.id, target.offset, openingLayer(context));

            requestRepaint();
        },

        onPointerDown(event, context) {
            const target = wallUnder(event, context);

            if (target === null) {
                return;
            }

            const opening = build(target.wall.id, target.offset, openingLayer(context));

            clearDraft();
            runCommand(addElements([opening], label));

            const store = useEditorStore.getState();
            store.select([opening.id]);
            store.setTool('select');
        },

        cancel() {
            interaction.hoveredId = null;
            clearDraft();
        },
    };
}

/** Openings belong on the openings layer when it exists, not on whatever is active. */
function openingLayer(context: ToolContext): string {
    return context.drawing.layers.some((layer) => layer.id === 'layer_openings')
        ? 'layer_openings'
        : context.activeLayerId;
}

export function createDoorTool(): Tool {
    return createOpeningTool('door', 'Door', (hostId, offset, layerId) =>
        createDoor(hostId, offset, layerId),
    );
}

export function createWindowTool(): Tool {
    return createOpeningTool('window', 'Window', (hostId, offset, layerId) =>
        createWindow(hostId, offset, layerId),
    );
}

/** A room is a closed ring collected click by click, the same way a polygon is. */
export function createRoomTool(): Tool {
    let vertices: Point[] = [];

    function commit(context: ToolContext): void {
        const room = vertices.length >= 3 ? createRoom(vertices, context.activeLayerId) : null;

        vertices = [];
        clearDraft();

        if (room === null) {
            return;
        }

        runCommand(addElements([room], 'Room'));

        const store = useEditorStore.getState();
        store.select([room.id]);
        store.setTool('select');
    }

    return {
        id: 'room',
        cursor: 'crosshair',

        anchors: () => vertices,

        onPointerDown(event, context) {
            const first = vertices[0];

            if (
                first !== undefined &&
                vertices.length >= 3 &&
                distance(event.world, first) <= context.tolerance
            ) {
                commit(context);

                return;
            }

            vertices = [...vertices, event.world];
            interaction.draftPoints = vertices;
            requestRepaint();
        },

        onPointerMove(event, context) {
            if (vertices.length === 0) {
                return;
            }

            const points = [...vertices, event.world];
            interaction.preview =
                points.length >= 3 ? createRoom(points, context.activeLayerId) : null;

            requestRepaint();
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

/** Places whichever library block is currently chosen, centred on the snapped point. */
export function createAssetTool(): Tool {
    return {
        id: 'asset',
        cursor: 'copy',

        onPointerMove(event) {
            const definition = findAsset(useEditorStore.getState().pendingAssetId ?? '');

            interaction.preview =
                definition === undefined ? null : createAsset(definition, event.world);

            requestRepaint();
        },

        onPointerDown(event) {
            const store = useEditorStore.getState();
            const definition = findAsset(store.pendingAssetId ?? '');

            if (definition === undefined) {
                return;
            }

            const element = createAsset(definition, event.world);

            clearDraft();
            runCommand(addElements([element], definition.name));

            // Placing one block is usually not placing only one, so the tool stays armed;
            // Escape or picking another tool is how you stop.
            store.select([element.id]);
        },

        cancel() {
            // Escape should put the block down, not leave the tool armed with an invisible
            // one. This writes to the store from inside a store notification, which is safe
            // because the controller advances its record of the current tool before
            // cancelling — see InputController.attach.
            clearDraft();
            useEditorStore.getState().setPendingAsset(null);
        },
    };
}
