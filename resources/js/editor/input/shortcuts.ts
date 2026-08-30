import type { ToolId } from '@/editor/store/editorStore';

/**
 * Every keyboard shortcut the editor has, written down once.
 *
 * The controller dispatches from this table, the toolbar labels its buttons from it and the
 * reference dialog is a rendering of it — so a shortcut cannot exist without being findable,
 * and a tooltip cannot promise a key that nothing listens for.
 *
 * `Mod` is Ctrl everywhere and Command on a Mac; it is kept abstract here because this module
 * has no business knowing what it is running on.
 */

export interface ToolShortcut {
    id: ToolId;
    label: string;
    /** The single character that selects this tool, upper case for display. */
    key: string;
}

/** The drawing tools, in the order the toolbar shows them. `asset` is armed by the library. */
export const TOOL_SHORTCUTS: readonly ToolShortcut[] = [
    { id: 'select', label: 'Select', key: 'V' },
    { id: 'wall', label: 'Wall', key: 'W' },
    { id: 'door', label: 'Door', key: 'D' },
    { id: 'window', label: 'Window', key: 'N' },
    { id: 'room', label: 'Room', key: 'O' },
    { id: 'line', label: 'Line', key: 'L' },
    { id: 'rect', label: 'Rectangle', key: 'R' },
    { id: 'circle', label: 'Circle', key: 'C' },
    { id: 'polygon', label: 'Polygon', key: 'P' },
    { id: 'text', label: 'Text', key: 'T' },
];

/** The key that opens the block library. Not a tool: the tool arms when a block is chosen. */
export const LIBRARY_KEY = 'B';

/** The key that opens this very reference. */
export const REFERENCE_KEY = '?';

const BY_KEY = new Map(TOOL_SHORTCUTS.map((shortcut) => [shortcut.key.toLowerCase(), shortcut.id]));

export function toolForKey(key: string): ToolId | undefined {
    return BY_KEY.get(key.toLowerCase());
}

export function keyForTool(id: ToolId): string | undefined {
    return TOOL_SHORTCUTS.find((shortcut) => shortcut.id === id)?.key;
}

export interface Shortcut {
    /**
     * Chords, in press order. `Mod` renders as Ctrl or Command; everything else renders as
     * written. Several entries mean several ways to do the same thing.
     */
    keys: string[][];
    label: string;
    /** True when the read-only share viewer honours it too. */
    viewer?: boolean;
}

export interface ShortcutGroup {
    title: string;
    shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
    {
        title: 'Tools',
        shortcuts: [
            ...TOOL_SHORTCUTS.map((tool) => ({ keys: [[tool.key]], label: tool.label })),
            { keys: [[LIBRARY_KEY]], label: 'Block library' },
        ],
    },
    {
        title: 'Drawing',
        shortcuts: [
            { keys: [['Enter']], label: 'Finish the current chain, polygon or label' },
            { keys: [['Esc']], label: 'Cancel what you are drawing, or deselect' },
            { keys: [['Mod', 'Z']], label: 'Undo' },
            { keys: [['Mod', 'Shift', 'Z']], label: 'Redo' },
            { keys: [['Mod', 'S']], label: 'Save now' },
        ],
    },
    {
        title: 'Selection',
        shortcuts: [
            { keys: [['Click']], label: 'Select · Shift-click to add or remove' },
            { keys: [['Drag']], label: 'Box select · right to left crosses' },
            { keys: [['Mod', 'A']], label: 'Select everything selectable' },
            { keys: [['Mod', 'D']], label: 'Duplicate the selection' },
            { keys: [['Del'], ['Backspace']], label: 'Delete the selection' },
            { keys: [['←', '→', '↑', '↓']], label: 'Nudge by one grid step' },
            { keys: [['Alt', '←', '→', '↑', '↓']], label: 'Nudge by one millimetre' },
        ],
    },
    {
        title: 'View',
        shortcuts: [
            { keys: [['Space', 'Drag'], ['Middle-drag']], label: 'Pan', viewer: true },
            { keys: [['Wheel']], label: 'Zoom to the cursor', viewer: true },
            { keys: [['Shift', '1']], label: 'Zoom to the whole drawing', viewer: true },
            { keys: [['Shift', '2']], label: 'Zoom to the selection' },
            { keys: [['G']], label: 'Show or hide the grid' },
            { keys: [['S']], label: 'Snap to grid on or off' },
            { keys: [[REFERENCE_KEY]], label: 'This list' },
        ],
    },
];
