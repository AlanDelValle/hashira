import { create } from 'zustand';

import type { Point } from '@/editor/geometry/vec';
import { DEFAULT_TEXT_SIZE } from '@/editor/model/factories';
import { newId } from '@/editor/model/id';

/** A label being typed. The id gives each draft its own identity, and its own empty field. */
export interface TextDraft {
    id: string;
    at: Point;
}

export type ToolId =
    | 'select'
    | 'wall'
    | 'door'
    | 'window'
    | 'room'
    | 'line'
    | 'rect'
    | 'circle'
    | 'polygon'
    | 'text'
    | 'asset';

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
    gridVisible: boolean;
    snapToGrid: boolean;
    /** Thickness applied to the next wall drawn, in millimetres. */
    wallThickness: number;
    /** Cap height applied to the next label written, in millimetres at 1:1. */
    textSize: number;
    /**
     * Where a label is being typed, if one is.
     *
     * This is the one thing in flight that has to reach React: a label is typed into a real
     * input, because a canvas cannot offer a caret, selection or an input method. Everything
     * else in flight — drags, rubber bands, snap previews — stays out of React by design.
     */
    textDraft: TextDraft | null;
    /** The library block the asset tool will place, if any. */
    pendingAssetId: string | null;
    /** Whether the block library is showing. */
    libraryOpen: boolean;
    /** Whether the keyboard reference is showing. */
    shortcutsOpen: boolean;

    setTool: (tool: ToolId) => void;
    setActiveLayer: (layerId: string) => void;
    setWallThickness: (thickness: number) => void;
    setTextSize: (size: number) => void;
    beginText: (at: Point) => void;
    cancelText: () => void;
    setPendingAsset: (assetId: string | null) => void;
    toggleLibrary: () => void;
    setShortcutsOpen: (open: boolean) => void;
    select: (ids: string[]) => void;
    toggleInSelection: (id: string) => void;
    clearSelection: () => void;
    toggleGrid: () => void;
    toggleSnap: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
    tool: 'select',
    selection: [],
    activeLayerId: 'layer_architecture',
    gridVisible: true,
    snapToGrid: true,
    wallThickness: 150,
    textSize: DEFAULT_TEXT_SIZE,
    textDraft: null,
    pendingAssetId: null,
    libraryOpen: false,
    shortcutsOpen: false,

    setTool: (tool) =>
        set((state) => ({
            tool,
            // Choosing any other tool puts the library block down and abandons a half-typed
            // label — neither has anywhere to live once the tool that owns it is gone.
            pendingAssetId: tool === 'asset' ? state.pendingAssetId : null,
            textDraft: tool === 'text' ? state.textDraft : null,
        })),

    setActiveLayer: (activeLayerId) => set({ activeLayerId }),

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
    setTextSize: (textSize) => set({ textSize }),

    beginText: (at) => set({ textDraft: { id: newId(), at } }),
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
    toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
}));

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}
