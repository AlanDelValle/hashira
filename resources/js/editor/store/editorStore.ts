import { create } from 'zustand';

import type { Point } from '@/editor/geometry/vec';
import {
    DEFAULT_CLOUD_RADIUS,
    DEFAULT_DIMENSION_SIZE,
    DEFAULT_TEXT_SIZE,
} from '@/editor/model/factories';
import { newId } from '@/editor/model/id';

/** Twelve square metres: a small bedroom, and a number somebody would actually type. */
const DEFAULT_TARGET_AREA = 12_000_000;
import { DEFAULT_LINE_TYPE } from '@/editor/model/lineTypes';
import type { DoorLeaf, LineType } from '@/editor/model/types';

/**
 * Words being typed onto the sheet. The id gives each draft its own identity, and its own
 * empty field.
 *
 * `leader` is the line already drawn to whatever the words are about, when there is one: a
 * note and a label are the same act of writing, and differ only in whether anything points
 * at what is being written about.
 */
/** A pin about to be dropped: where it points, and what it was dropped on, if anything. */
export interface CommentDraft {
    id: string;
    at: Point;
    elementId: string | null;
}

export interface TextDraft {
    id: string;
    at: Point;
    leader?: Point[];
}

export type ToolId =
    | 'select'
    | 'wall'
    | 'door'
    | 'window'
    | 'room'
    | 'area'
    | 'line'
    | 'rect'
    | 'circle'
    | 'polygon'
    | 'text'
    | 'dimension'
    | 'angle'
    | 'radius'
    | 'leader'
    | 'cloud'
    | 'asset'
    /*
     * Not a drawing tool: it commits nothing to the document and produces no command. It is
     * here because it is a pointer mode you pick with a key, which is exactly what a ToolId
     * is — and being one means the toolbar, the shortcut table and the reference dialog all
     * find it without a second mechanism.
     */
    | 'comment';

/**
 * What the interface is doing, as opposed to what the drawing contains.
 *
 * None of this is saved with the document: which tool is active, what is selected and which
 * layer new work lands on belong to the person editing, not to the drawing.
 */
interface EditorStore {
    tool: ToolId;
    /** Ids, in selection order. */
    selection: string[];
    activeLayerId: string;
    /**
     * Which sheet is being looked at and edited.
     *
     * Like the active layer, this is about the person rather than the drawing: two people
     * with the same plan open are not obliged to be on the same page of it. Null until one
     * is chosen, which resolves to the drawing's first sheet.
     */
    activeSheetId: string | null;
    gridVisible: boolean;
    /** Whether the active sheet's outline is drawn over the drawing. */
    sheetFrameVisible: boolean;
    snapToGrid: boolean;
    /** Thickness applied to the next wall drawn, in millimetres. */
    wallThickness: number;
    /**
     * How the next line, rectangle, polygon or circle reads.
     *
     * Carried from one shape to the next, like the wall thickness: a centre line is almost
     * never drawn on its own, and having to reach for the properties panel after every run is
     * how somebody ends up drawing them all continuous and fixing it later.
     */
    lineType: LineType;
    /**
     * The area the next room drawn from one has to have, in square millimetres.
     *
     * A request rather than a record: it decides the size of the four walls the area tool
     * places and is then forgotten, because what the drawing holds afterwards is the walls,
     * and the area it really has is measured off them.
     */
    targetArea: number;
    /**
     * How the next opening placed with the door tool operates.
     *
     * A tool setting rather than a tool of its own: seven kinds of door would be seven
     * buttons and seven keys for one act, which is choosing what to cut into a wall.
     */
    doorLeaf: DoorLeaf;
    /** Cap height applied to the next label written, in millimetres at 1:1. */
    textSize: number;
    /** Cap height applied to the next measurement's value, in millimetres at 1:1. */
    dimensionSize: number;
    /** Bump size applied to the next revision cloud, in millimetres at 1:1. */
    cloudRadius: number;
    /**
     * Where a label or a note is being typed, if one is.
     *
     * This is the one thing in flight that has to reach React: a label is typed into a real
     * input, because a canvas cannot offer a caret, selection or an input method. Everything
     * else in flight — drags, rubber bands, snap previews — stays out of React by design.
     */
    textDraft: TextDraft | null;
    commentDraft: CommentDraft | null;
    /** The library block the asset tool will place, if any. */
    pendingAssetId: string | null;
    /** Whether the block library is showing. */
    libraryOpen: boolean;
    /** Whether the keyboard reference is showing. */
    shortcutsOpen: boolean;

    setTool: (tool: ToolId) => void;
    setActiveLayer: (layerId: string) => void;
    setActiveSheet: (sheetId: string) => void;
    setWallThickness: (thickness: number) => void;
    setLineType: (lineType: LineType) => void;
    setTargetArea: (area: number) => void;
    setDoorLeaf: (leaf: DoorLeaf) => void;
    setTextSize: (size: number) => void;
    setDimensionSize: (size: number) => void;
    setCloudRadius: (radius: number) => void;
    beginComment: (at: Point, elementId: string | null) => void;
    cancelComment: () => void;
    beginText: (at: Point) => void;
    beginNote: (points: Point[]) => void;
    cancelText: () => void;
    setPendingAsset: (assetId: string | null) => void;
    toggleLibrary: () => void;
    setShortcutsOpen: (open: boolean) => void;
    select: (ids: string[]) => void;
    toggleInSelection: (id: string) => void;
    clearSelection: () => void;
    toggleGrid: () => void;
    toggleSheetFrame: () => void;
    toggleSnap: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
    tool: 'select',
    selection: [],
    activeLayerId: 'layer_architecture',
    activeSheetId: null,
    gridVisible: true,
    // Off by default: a page outline around a drawing nobody has decided to print yet is one
    // more rectangle to read past.
    sheetFrameVisible: false,
    snapToGrid: true,
    wallThickness: 150,
    lineType: DEFAULT_LINE_TYPE,
    targetArea: DEFAULT_TARGET_AREA,
    doorLeaf: 'single',
    textSize: DEFAULT_TEXT_SIZE,
    dimensionSize: DEFAULT_DIMENSION_SIZE,
    cloudRadius: DEFAULT_CLOUD_RADIUS,
    textDraft: null,
    commentDraft: null,
    pendingAssetId: null,
    libraryOpen: false,
    shortcutsOpen: false,

    setTool: (tool) =>
        set((state) => ({
            tool,
            // Choosing any other tool puts the library block down and abandons a half-typed
            // label — neither has anywhere to live once the tool that owns it is gone.
            pendingAssetId: tool === 'asset' ? state.pendingAssetId : null,
            textDraft: tool === 'text' || tool === 'leader' ? state.textDraft : null,
            commentDraft: tool === 'comment' ? state.commentDraft : null,
        })),

    setActiveLayer: (activeLayerId) => set({ activeLayerId }),

    setActiveSheet: (activeSheetId) => set({ activeSheetId }),

    /*
     * Closing the library also puts down whatever block was armed: leaving the tool loaded
     * with a panel you can no longer see is a state nothing on screen explains.
     */
    toggleLibrary: () =>
        set((state) =>
            state.libraryOpen
                ? {
                      libraryOpen: false,
                      pendingAssetId: null,
                      tool: state.tool === 'asset' ? ('select' as const) : state.tool,
                  }
                : { libraryOpen: true },
        ),

    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

    setWallThickness: (wallThickness) => set({ wallThickness }),
    setLineType: (lineType) => set({ lineType }),
    setTargetArea: (targetArea) => set({ targetArea }),
    setDoorLeaf: (doorLeaf) => set({ doorLeaf }),
    setTextSize: (textSize) => set({ textSize }),
    setDimensionSize: (dimensionSize) => set({ dimensionSize }),
    setCloudRadius: (cloudRadius) => set({ cloudRadius }),

    beginComment: (at, elementId) => set({ commentDraft: { id: newId(), at, elementId } }),
    cancelComment: () =>
        set((state) => (state.commentDraft === null ? state : { commentDraft: null })),

    beginText: (at) => set({ textDraft: { id: newId(), at } }),

    beginNote: (points) =>
        set({
            textDraft: {
                id: newId(),
                at: points[points.length - 1] ?? { x: 0, y: 0 },
                leader: points,
            },
        }),
    cancelText: () => set((state) => (state.textDraft === null ? state : { textDraft: null })),
    /*
     * Choosing a block arms the tool; clearing it disarms the tool as well. Leaving the block
     * tool active with nothing to place would be a state where clicking does nothing and the
     * cursor still promises it will.
     */
    setPendingAsset: (pendingAssetId) =>
        set((state) => ({
            pendingAssetId,
            tool:
                pendingAssetId === null
                    ? state.tool === 'asset'
                        ? ('select' as const)
                        : state.tool
                    : ('asset' as const),
        })),

    select: (ids) =>
        set((state) =>
            // Selecting the same thing again must not produce a new array, or every panel
            // subscribed to the selection would re-render on each click.
            sameIds(state.selection, ids) ? state : { selection: ids },
        ),

    toggleInSelection: (id) =>
        set((state) => ({
            selection: state.selection.includes(id)
                ? state.selection.filter((current) => current !== id)
                : [...state.selection, id],
        })),

    clearSelection: () =>
        set((state) => (state.selection.length === 0 ? state : { selection: [] })),

    toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
    toggleSheetFrame: () => set((state) => ({ sheetFrameVisible: !state.sheetFrameVisible })),
    toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
}));

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}
