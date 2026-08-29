import type { Point } from '@/editor/geometry/vec';
import type { ElementLookup } from '@/editor/model/elements';
import type { HashiraDocument } from '@/editor/model/types';
import type { ToolId } from '@/editor/store/editorStore';
import type { Viewport } from '@/editor/viewport/viewport';

/**
 * A tool is a small state machine over pointer and key events. It reads the world through the
 * context it is handed, writes previews into interaction state, and produces exactly one
 * command when an action completes — never a partial edit.
 */

export interface ToolEvent {
    /** Pointer position in world millimetres, already snapped where the tool asked for it. */
    world: Point;
    /** Raw pointer position in world millimetres, unsnapped. */
    rawWorld: Point;
    screen: Point;
    shift: boolean;
    alt: boolean;
    /** Ctrl on Windows and Linux, Command on macOS. */
    mod: boolean;
    button: number;
}

export interface ToolContext {
    drawing: HashiraDocument;
    lookup: ElementLookup;
    viewport: Viewport;
    /** Pick tolerance in world millimetres, converted from a fixed screen distance. */
    tolerance: number;
    activeLayerId: string;
    /** Round a world point to the grid, when grid snapping is on. */
    snap: (p: Point) => Point;
}

export interface Tool {
    readonly id: ToolId;
    readonly cursor: string;

    onPointerDown?: (event: ToolEvent, context: ToolContext) => void;
    onPointerMove?: (event: ToolEvent, context: ToolContext) => void;
    onPointerUp?: (event: ToolEvent, context: ToolContext) => void;
    onDoubleClick?: (event: ToolEvent, context: ToolContext) => void;

    /** Return true when the tool consumed the key. */
    onKeyDown?: (key: string, context: ToolContext) => boolean;

    /** Abandon whatever is in progress, on Escape or when the tool is switched away. */
    cancel: () => void;
}
