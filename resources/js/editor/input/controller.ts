import { addElements, deleteElements, replaceElements } from '@/editor/commands/command';
import { point, type Point } from '@/editor/geometry/vec';
import { documentIndex } from '@/editor/model/documentIndex';
import {
    documentBounds,
    elementBounds,
    makeLookup,
    translateElement,
} from '@/editor/model/elements';
import { duplicateElements } from '@/editor/model/duplicate';
import type { Element, HashiraDocument } from '@/editor/model/types';
import { autosave } from '@/editor/persistence/autosave';
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
import { LIBRARY_KEY, REFERENCE_KEY, toolForKey } from '@/editor/input/shortcuts';
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

export interface InputOptions {
    /**
     * A viewer rather than an editor: pan and zoom work, nothing else does. Used by the public
     * share page, where there is no tool to dispatch to and nothing to edit.
     */
    readOnly?: boolean;
}

export class InputController {
    private readonly canvas: HTMLCanvasElement;
    private readonly readOnly: boolean;
    private tools: Record<ToolId, Tool>;
    private activeToolId: ToolId = 'select';
    private spaceHeld = false;
    private panningFrom: Point | null = null;
    private unsubscribe: (() => void) | null = null;

    constructor(canvas: HTMLCanvasElement, options: InputOptions = {}) {
        this.canvas = canvas;
        this.readOnly = options.readOnly ?? false;
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
            if (state.tool === this.activeToolId) {
                return;
            }

            /*
             * The outgoing tool is captured and `activeToolId` advanced *before* cancelling,
             * because a tool's cancel may touch the very store this subscription listens to.
             * Updating the guard afterwards left the re-entrant notification still believing
             * the old tool was current, and it cancelled again — for ever.
             */
            const outgoing = this.tool;

            this.activeToolId = state.tool;
            this.applyCursor();
            outgoing.cancel();
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
        this.canvas.style.cursor = this.readOnly || this.spaceHeld ? 'grab' : this.tool.cursor;
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
            lookup: documentIndex(drawing).lookup,
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

        // Middle button, or the space bar, always pans — whichever tool is active. In a
        // viewer, so does the left button: there is nothing else for it to do.
        if (event.button === 1 || this.spaceHeld || this.readOnly) {
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

        if (this.readOnly) {
            requestRepaint();

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

        if (this.readOnly) {
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
        if (keyBelongsElsewhere(event.target)) {
            return;
        }

        // A viewer keeps the two framing shortcuts and nothing that could change a drawing.
        if (this.readOnly) {
            if (event.shiftKey && (event.code === 'Digit1' || event.code === 'Digit2')) {
                event.preventDefault();
                this.zoomTo('drawing');
            }

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

        if (mod && event.key.toLowerCase() === 's') {
            // The browser's own save dialog is never what someone means here.
            event.preventDefault();
            autosave.flush();

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

        if (mod || event.altKey) {
            return;
        }

        const tool = toolForKey(event.key);

        if (tool !== undefined) {
            store.setTool(tool);

            return;
        }

        switch (event.key.toLowerCase()) {
            case LIBRARY_KEY.toLowerCase():
                store.toggleLibrary();

                return;

            case 'g':
                store.toggleGrid();

                return;

            case 's':
                store.toggleSnap();

                return;

            case REFERENCE_KEY:
                store.setShortcutsOpen(true);
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
        const lookup = makeLookup(drawing.elements);

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
            makeLookup(drawing.elements),
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

        const lookup = makeLookup(drawing.elements);
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
        const lookup = makeLookup(drawing.elements);
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

/**
 * Keys that are not the editor's to take.
 *
 * A key typed into a field belongs to the field. A key pressed while a dialog or a menu is
 * open belongs to that — otherwise naming a version "door" would swap the tool underneath it,
 * and pressing Delete in a menu would delete the selection behind it.
 */
function keyBelongsElsewhere(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    ) {
        return true;
    }

    return target.closest('[role="dialog"], [role="menu"], [role="alertdialog"]') !== null;
}

function preventDefault(event: Event): void {
    event.preventDefault();
}
