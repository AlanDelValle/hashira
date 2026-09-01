import type { Point } from '@/editor/geometry/vec';
import type { Element } from '@/editor/model/types';
import type { SnapResult } from '@/editor/snapping/engine';

/**
 * Transient interaction state, deliberately outside React and outside every store.
 *
 * This is what changes on every pointer move: the hovered element, the rubber band, the shape
 * being drawn. It is mutated in place and read by the next animation frame, so a drag across
 * a large plan costs zero React renders. Nothing here is ever saved.
 */

/** Dragging left-to-right selects only what is fully inside; right-to-left, anything touched. */
export type MarqueeMode = 'window' | 'crossing';

export interface Marquee {
    from: Point;
    to: Point;
    mode: MarqueeMode;
}

export interface DragState {
    /** Where the pointer went down, in world space, snapped. */
    origin: Point;
    /**
     * And where it went down before anything snapped it.
     *
     * A move is measured from here, because what snaps during a move is the geometry being
     * moved rather than the pointer; measuring from a snapped origin would apply the pointer's
     * correction as well and land the selection somewhere neither of them asked for.
     */
    originRaw: Point;
    /** Where it is now. */
    current: Point;
    /** The elements as they were when the drag began, for building the command on release. */
    before: Element[];
    /** The elements as they look right now, painted instead of the originals. */
    preview: Element[];
    kind: 'move' | 'rotate';
    /** Set once the pointer has travelled far enough to mean a drag and not a click. */
    engaged: boolean;
}

export interface InteractionState {
    pointerScreen: Point | null;
    pointerWorld: Point | null;
    hoveredId: string | null;
    marquee: Marquee | null;
    drag: DragState | null;
    /** Vertices committed so far by a multi-click tool, in world space. */
    draftPoints: Point[];
    /**
     * The shape currently being drawn, as a real element. Building it with the same factory
     * the commit uses means the preview cannot look different from the result.
     */
    preview: Element | null;
    /**
     * What caught the pointer last, so the overlay can say why it moved. Grid snaps are not
     * recorded: they happen on every move, and a marker that is always on says nothing.
     */
    snap: SnapResult | null;
    /** True while the space bar or middle button is panning the view. */
    panning: boolean;
}

export const interaction: InteractionState = {
    pointerScreen: null,
    pointerWorld: null,
    hoveredId: null,
    marquee: null,
    drag: null,
    draftPoints: [],
    preview: null,
    snap: null,
    panning: false,
};

export function resetInteraction(): void {
    interaction.hoveredId = null;
    interaction.marquee = null;
    interaction.drag = null;
    interaction.draftPoints = [];
    interaction.preview = null;
    interaction.snap = null;
    interaction.panning = false;
}
