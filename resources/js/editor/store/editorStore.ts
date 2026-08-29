import { create } from 'zustand';

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'polygon';

/**
 * What the interface is doing, as opposed to what the drawing contains.
 *
 * None of this is saved with the document: which tool is active and what is selected belong
 * to the person editing, not to the drawing.
 */
interface EditorStore {
    tool: ToolId;
    /** Ids, in selection order. */
    selection: string[];
    activeLayerId: string;
    gridVisible: boolean;
    snapToGrid: boolean;

    setTool: (tool: ToolId) => void;
    setActiveLayer: (layerId: string) => void;
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

    setTool: (tool) => set({ tool }),
    setActiveLayer: (activeLayerId) => set({ activeLayerId }),

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
