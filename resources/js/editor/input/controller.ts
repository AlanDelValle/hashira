import { addElements, deleteElements, replaceElements } from '@/editor/commands/command';
import { point, type Point } from '@/editor/geometry/vec';
import {
    documentBounds,
    elementBounds,
    makeLookup,
    translateElement,
} from '@/editor/model/elements';
import { duplicateElements } from '@/editor/model/duplicate';
import type { Element, HashiraDocument } from '@/editor/model/types';
import { requestRepaint } from '@/editor/render/frame';
import { history, runCommand, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore, type ToolId } from '@/editor/store/editorStore';
import { interaction, resetInteraction } from '@/editor/store/interaction';
import { useViewportStore } from '@/editor/store/viewportStore';
import {
    createAssetTool,
    createDoorTool,
    createRoomTool,
    createWallTool,
    createWindowTool,
} from '@/editor/tools/architectureTools';
import {
    createCircleTool,
    createLineTool,
    createPolygonTool,
    createRectTool,
} from '@/editor/tools/drawTools';
import { createSelectTool } from '@/editor/tools/selectTool';
import { snapPoint } from '@/editor/snapping/engine';
import type { Tool, ToolContext, ToolEvent } from '@/editor/tools/types';
import { panByScreen, toWorld, zoomAt } from '@/editor/viewport/viewport';
import { unionBounds, type Bounds } from '@/editor/geometry/bbox';

/**
 * Everything the pointer and the keyboard do.
 *
 * The controller owns no drawing state: it turns DOM events into tool events, handles the
 * things that sit above every tool — panning, zooming, undo, delete — and gets out of the way.
 */

/** How close the pointer has to be to something to pick it, in screen pixels. */
const PICK_TOLERANCE_PX = 6;

/** Snapping reaches a little further than picking: it is a suggestion, not a selection. */
const SNAP_TOLERANCE_PX = 10;

/** One wheel notch. */
const ZOOM_STEP = 1.12;

const DUPLICATE_OFFSET_MM = 200;

const TOOL_SHORTCUTS: Record<string, ToolId> = {
    v: 'select',
    w: 'wall',
    d: 'door',
    n: 'window',
    o: 'room',
    l: 'line',
    r: 'rect',
    c: 'circle',
    p: 'polygon',
};

export class InputController {
    private readonly canvas: HTMLCanvasElement;
    private tools: Record<ToolId, Tool>;
    private activeToolId: ToolId = 'select';
    private spaceHeld = false;
    private panningFrom: Point | null = null;
    private unsubscribe: (() => void) | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.tools = {
            select: createSelectTool(),
            wall: createWallTool(),
            door: createDoorTool(),
            window: createWindowTool(),
            room: createRoomTool(),
            line: createLineTool(),
            rect: createRectTool(),
            circle: createCircleTool(),
            polygon: createPolygonTool(),
            asset: createAssetTool(),
        };
    }

    attach(): void {
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointerleave', this.onPointerLeave);
        this.canvas.addEventListener('dblclick', this.onDoubleClick);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', preventDefault);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);

        this.activeToolId = useEditorStore.getState().tool;
        this.unsubscribe = useEditorStore.subscribe((state) => {
            if (state.tool !== this.activeToolId) {
                this.tool.cancel();
                this.activeToolId = state.tool;
                this.applyCursor();
            }
        });

        this.applyCursor();
    }

    detach(): void {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
        this.canvas.removeEventListener('dblclick', this.onDoubleClick);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('contextmenu', preventDefault);

        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);

        this.unsubscribe?.();
        this.unsubscribe = null;
        resetInteraction();
    }

    private get tool(): Tool {
        return this.tools[this.activeToolId];
    }

    private applyCursor(): void {
        this.canvas.style.cursor = this.spaceHeld ? 'grab' : this.tool.cursor;
    }

    private screenPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();

        return point(event.clientX - rect.left, event.clientY - rect.top);
    }

    private context(): ToolContext {
        const drawing = useDocumentStore.getState().document;
        const { viewport } = useViewportStore.getState();
        const { activeLayerId, snapToGrid: gridSnapEnabled } = useEditorStore.getState();
        const tolerance = PICK_TOLERANCE_PX / viewport.zoom;

        return {
            drawing,
            lookup: makeLookup(drawing),
            viewport,
            tolerance,
            activeLayerId,
            snap: (p) => {
                const result = snapPoint(p, {
                    drawing,
                    settings: drawing.settings.snapping,
                    gridSnapEnabled: gridSnapEnabled && drawing.settings.grid.snap,
                    gridSize: drawing.settings.grid.size,
                    tolerance: SNAP_TOLERANCE_PX / viewport.zoom,
                    exclude: this.tool.snapExclusions?.() ?? undefined,
                    anchors: this.tool.anchors?.() ?? undefined,
                });

                // The grid catches every move, so recording it would leave an indicator
                // permanently lit and saying nothing. Only meaningful snaps are shown.
                interaction.snap = result.kind === null || result.kind === 'grid' ? null : result;

                return result;
            },
        };
    }

    private toolEvent(event: PointerEvent | MouseEvent, context: ToolContext): ToolEvent {
        const screen = this.screenPoint(event);
        const rawWorld = toWorld(context.viewport, screen);

        return {
            screen,
            rawWorld,
            world: context.snap(rawWorld).point,
            shift: event.shiftKey,
            alt: event.altKey,
            mod: event.ctrlKey || event.metaKey,
            button: 'button' in event ? event.button : 0,
        };
    }

    private onPointerDown = (event: PointerEvent): void => {
        this.canvas.focus();

        // Middle button, or the space bar, always pans — whichever tool is active.
        if (event.button === 1 || this.spaceHeld) {
            this.panningFrom = this.screenPoint(event);
            interaction.panning = true;
            this.canvas.setPointerCapture(event.pointerId);
            this.canvas.style.cursor = 'grabbing';
            event.preventDefault();

            return;
        }

        if (event.button !== 0) {
            return;
        }

        this.canvas.setPointerCapture(event.pointerId);

        const context = this.context();
        this.tool.onPointerDown?.(this.toolEvent(event, context), context);
        requestRepaint();
    };

    private onPointerMove = (event: PointerEvent): void => {
        const context = this.context();
        const toolEvent = this.toolEvent(event, context);

        interaction.pointerScreen = toolEvent.screen;
        interaction.pointerWorld = toolEvent.rawWorld;

        if (this.panningFrom !== null) {
            const { viewport, setViewport } = useViewportStore.getState();

            setViewport(
                panByScreen(viewport, {
                    x: toolEvent.screen.x - this.panningFrom.x,
                    y: toolEvent.screen.y - this.panningFrom.y,
                }),
            );

            this.panningFrom = toolEvent.screen;

            return;
        }

        this.tool.onPointerMove?.(toolEvent, context);
        requestRepaint();
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
        }

        if (this.panningFrom !== null) {
            this.panningFrom = null;
            interaction.panning = false;
            this.applyCursor();

            return;
        }

        const context = this.context();
        this.tool.onPointerUp?.(this.toolEvent(event, context), context);
        requestRepaint();
    };

    private onPointerLeave = (): void => {
        interaction.pointerScreen = null;
        interaction.pointerWorld = null;
        interaction.hoveredId = null;
        requestRepaint();
    };

    private onDoubleClick = (event: MouseEvent): void => {
        const context = this.context();
        this.tool.onDoubleClick?.(this.toolEvent(event, context), context);
        requestRepaint();
    };

    private onWheel = (event: WheelEvent): void => {
        event.preventDefault();

        const { viewport, setViewport } = useViewportStore.getState();
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

        setViewport(zoomAt(viewport, this.screenPoint(event), factor));
    };

    private onKeyDown = (event: KeyboardEvent): void => {
        if (isTypingTarget(event.target)) {
            return;
        }

        const mod = event.ctrlKey || event.metaKey;
        const store = useEditorStore.getState();

        if (event.code === 'Space' && !this.spaceHeld) {
            this.spaceHeld = true;
            this.applyCursor();
            event.preventDefault();

            return;
        }

        if (this.tool.onKeyDown?.(event.key, this.context()) === true) {
            event.preventDefault();

            return;
        }

        if (mod && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            this.tool.cancel();

            if (event.shiftKey) {
                history.redo();
            } else {
                history.undo();
            }

            this.pruneSelection();

            return;
        }

        if (mod && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            store.select(selectableIds(useDocumentStore.getState().document));

            return;
        }

        if (mod && event.key.toLowerCase() === 'd') {
            event.preventDefault();
            this.duplicateSelection();

            return;
        }

        if (event.shiftKey && (event.code === 'Digit1' || event.code === 'Digit2')) {
            event.preventDefault();
            this.zoomTo(event.code === 'Digit1' ? 'drawing' : 'selection');

            return;
        }

        if (event.key === 'Escape') {
            this.tool.cancel();
            store.clearSelection();
            requestRepaint();

            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            const { selection } = store;

            if (selection.length > 0) {
                event.preventDefault();
                runCommand(deleteElements(selection, 'Delete'));
                store.clearSelection();
            }

            return;
        }

        if (event.key.startsWith('Arrow')) {
            this.nudge(event);

            return;
        }

        if (!mod && !event.altKey) {
            const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];

            if (tool !== undefined) {
                store.setTool(tool);
            }
        }
    };

    private onKeyUp = (event: KeyboardEvent): void => {
        if (event.code === 'Space') {
            this.spaceHeld = false;
            this.applyCursor();
        }
    };

    /** After an undo, ids that no longer exist must not stay selected. */
    private pruneSelection(): void {
        const drawing = useDocumentStore.getState().document;
        const present = new Set(drawing.elements.map((element) => element.id));
        const store = useEditorStore.getState();

        store.select(store.selection.filter((id) => present.has(id)));
    }

    private selectedElements(): Element[] {
        const drawing = useDocumentStore.getState().document;
        const lookup = makeLookup(drawing);

        return useEditorStore.getState().selection.flatMap((id) => {
            const element = lookup(id);

            return element === undefined ? [] : [element];
        });
    }

    private duplicateSelection(): void {
        const originals = this.selectedElements();

        if (originals.length === 0) {
            return;
        }

        const drawing = useDocumentStore.getState().document;
        const copies = duplicateElements(
            originals,
            point(DUPLICATE_OFFSET_MM, DUPLICATE_OFFSET_MM),
            makeLookup(drawing),
        );

        runCommand(addElements(copies, 'Duplicate'));
        useEditorStore.getState().select(copies.map((element) => element.id));
    }

    /** Arrow keys move by one grid step, or by a single millimetre with Alt held. */
    private nudge(event: KeyboardEvent): void {
        const selected = this.selectedElements();

        if (selected.length === 0) {
            return;
        }

        event.preventDefault();

        const drawing = useDocumentStore.getState().document;
        const step = event.altKey ? 1 : drawing.settings.grid.size;
        const delta = {
            ArrowLeft: point(-step, 0),
            ArrowRight: point(step, 0),
            ArrowUp: point(0, -step),
            ArrowDown: point(0, step),
        }[event.key];

        if (delta === undefined) {
            return;
        }

        const lookup = makeLookup(drawing);
        const moved = selected.map((element) => translateElement(element, delta, lookup));
        const key = `nudge:${selected.map((element) => element.id).join(',')}`;

        runCommand(replaceElements(selected, moved, 'Move', key));
    }

    private zoomTo(target: 'drawing' | 'selection'): void {
        const drawing = useDocumentStore.getState().document;
        const { fit } = useViewportStore.getState();

        const bounds =
            target === 'drawing' ? documentBounds(drawing) : this.selectionBounds(drawing);

        if (bounds !== null) {
            fit(bounds);
        }
    }

    private selectionBounds(drawing: HashiraDocument): Bounds | null {
        const lookup = makeLookup(drawing);
        let bounds: Bounds | null = null;

        for (const element of this.selectedElements()) {
            bounds = unionBounds(bounds, elementBounds(element, lookup));
        }

        return bounds;
    }
}

function selectableIds(drawing: HashiraDocument): string[] {
    const selectable = new Set(
        drawing.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id),
    );

    return drawing.elements
        .filter((element) => selectable.has(element.layerId))
        .map((element) => element.id);
}

/** Keys typed into a field belong to the field, not to the editor. */
function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    );
}

function preventDefault(event: Event): void {
    event.preventDefault();
}
