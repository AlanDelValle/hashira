import type { DoorLeaf } from './types';

/**
 * What the kinds of opening are, written down once.
 *
 * The size each is built at, what it is called, and which of its two orientation choices mean
 * anything — all in one table, for the same reason the shortcuts are: a panel that offers
 * "Hinge" on an overhead door is offering a control that changes nothing on the sheet, and
 * that only stays true if there is one place that says so.
 */

/** The default clear width, in millimetres. */
export const DEFAULT_DOOR_WIDTH = 900;

/**
 * The clear width each kind is normally built at.
 *
 * A garage door is not a door with a different number typed into it: nobody builds 900 mm of
 * overhead door, so a tool that placed one and waited to be corrected would be wrong on every
 * first click. The kind carries its size, and the width stays editable like any other value.
 */
export const DEFAULT_LEAF_WIDTH: Record<DoorLeaf, number> = {
    single: DEFAULT_DOOR_WIDTH,
    double: 1600,
    sliding: 900,
    folding: 1800,
    overhead: 2400,
    gate: 1000,
    none: 900,
};

/**
 * Every kind and what it is called, in the order the panel offers them: the ones fitted to a
 * room, then the ones fitted to a plot, then the hole with nothing in it.
 */
export const LEAF_OPTIONS: { value: DoorLeaf; label: string }[] = [
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'sliding', label: 'Sliding' },
    { value: 'folding', label: 'Folding' },
    { value: 'overhead', label: 'Overhead' },
    { value: 'gate', label: 'Gate' },
    { value: 'none', label: 'Opening' },
];

const LABELS = new Map(LEAF_OPTIONS.map((option) => [option.value, option.label]));

/** What to call one, for a menu or for the entry an edit leaves in the history. */
export function leafLabel(leaf: DoorLeaf): string {
    return LABELS.get(leaf) ?? 'Door';
}

/**
 * What the jamb an opening works from is called, where choosing it means anything.
 *
 * Absent for the kinds where it does not: a double door uses both jambs, an overhead door
 * leaves neither, and a cased opening has nothing to work from at all.
 */
export const JAMB_LABEL: Partial<Record<DoorLeaf, string>> = {
    single: 'Hinge',
    gate: 'Hinge',
    sliding: 'Slides to',
    folding: 'Folds from',
};

/** What the side an opening moves to is called. Absent where it does not move. */
export const SIDE_LABEL: Partial<Record<DoorLeaf, string>> = {
    single: 'Opens back',
    double: 'Opens back',
    gate: 'Opens back',
    sliding: 'Panel behind',
    folding: 'Folds back',
    overhead: 'Tracks behind',
};
