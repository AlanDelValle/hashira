import { create } from 'zustand';

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
    /** The library block the asset tool will place, if any. */
    pendingAssetId: string | null;

    setTool: (tool: ToolId) => void;
    setActiveLayer: (layerId: string) => void;
    setWallThickness: (thickness: number) => void;
    setPendingAsset: (assetId: string | null) => void;
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
    pendingAssetId: null,

    setTool: (tool) =>
        set((state) => ({
            tool,
            // Choosing any other tool puts the library block down.
            pendingAssetId: tool === 'asset' ? state.pendingAssetId : null,
        })),

    setActiveLayer: (activeLayerId) => set({ activeLayerId }),
    setWallThickness: (wallThickness) => set({ wallThickness }),
    setPendingAsset: (pendingAssetId) =>
        set({ pendingAssetId, ...(pendingAssetId === null ? {} : { tool: 'asset' as const }) }),

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
