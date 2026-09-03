import type { DocumentDiff } from '@/editor/model/diff';
import { makeLookup } from '@/editor/model/elements';
import type { Element, HashiraDocument } from '@/editor/model/types';
import { wallJoins } from '@/editor/model/walls';
import { buildScene } from '@/editor/scene/build';
import { PEN, type SceneLayer, type ScenePrimitive, type Stroke } from '@/editor/scene/types';

/**
 * A comparison drawn as a redline.
 *
 * The picture is the newer drawing, in ink, with what changed marked over it — the way a set
 * of prints comes back from a review. Everything here is an outline: fills are dropped and
 * every primitive is restroked at a single heavy pen, so a marked wall reads as a wall with a
 * line round it rather than as a wall painted green.
 *
 * The marks say what happened twice over, because a redline that means something only in
 * colour means nothing to a good part of the people reading it:
 *
 * - **dashed** is a state that is gone — a deleted element, or where an edited one used to be
 * - **solid** is a state that is there now — something drawn, or an edit as it stands
 *
 * Nothing here reads the current document or the theme; it takes both sides and three colours
 * and returns primitives, so it is as testable as the scene builder it is made of.
 */

/** A colour that paints nothing, for a poché whose fill the marking is not interested in. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Sheet millimetres on, then off. The same pattern the drawing already dashes with. */
const DASH = [1.5, 1.2];

export interface RedlinePalette {
    added: string;
    removed: string;
    changed: string;
}

/**
 * The marks for one comparison, in painting order: what is gone underneath, what is there on
 * top. Both documents must be the ones the diff was taken from.
 */
export function buildRedlines(
    diff: DocumentDiff,
    before: HashiraDocument,
    after: HashiraDocument,
    palette: RedlinePalette,
): SceneLayer[] {
    const removed = pick(diff, 'removed', 'before');
    const editedFrom = pick(diff, 'changed', 'before');
    const editedTo = pick(diff, 'changed', 'after');
    const added = pick(diff, 'added', 'after');

    return [
        // Ghosts first, so an element that moved does not paint over where it went.
        ...mark(removed, before, palette.removed, true),
        ...mark(editedFrom, before, palette.changed, true),
        ...mark(editedTo, after, palette.changed, false),
        ...mark(added, after, palette.added, false),
    ];
}

function pick(
    diff: DocumentDiff,
    kind: 'added' | 'removed' | 'changed',
    side: 'before' | 'after',
): Element[] {
    return diff.elements.flatMap((change) => {
        const element = change[side];

        return change.kind === kind && element !== null ? [element] : [];
    });
}

/**
 * Mark a handful of elements out of the document they belong to.
 *
 * The whole document is what resolves them: a door has no position of its own, only a distance
 * along its wall, and a wall is mitred against neighbours that are not being marked. Both are
 * passed in rather than inferred from the handful, which is why a marked opening lands on the
 * wall it belongs to instead of nowhere.
 */
function mark(
    elements: readonly Element[],
    document: HashiraDocument,
    colour: string,
    dashed: boolean,
): SceneLayer[] {
    if (elements.length === 0) {
        return [];
    }

    const scene = buildScene(elements, document.layers, {
        palette: { ink: colour, subtle: colour, roomFill: TRANSPARENT, sheet: TRANSPARENT },
        unit: document.settings.unit,
        overrideColor: colour,
        lookup: makeLookup(document.elements),
        joins: wallJoins(document.elements),

        // A change on a hidden layer is still a change. This is a comparison of two documents
        // rather than a drawing, and one that leaves half of a version out is not a comparison.
        includeHidden: true,
    });

    const stroke: Stroke = dashed
        ? { color: colour, width: PEN.heavy, dash: DASH }
        : { color: colour, width: PEN.heavy };

    return scene.map((layer) => ({
        ...layer,
        primitives: layer.primitives.map((primitive) => outline(primitive, colour, stroke)),
    }));
}

/** Strip a primitive back to its outline, in the marking colour. */
function outline(primitive: ScenePrimitive, colour: string, stroke: Stroke): ScenePrimitive {
    switch (primitive.kind) {
        case 'polyline':
        case 'circle':
        case 'ellipse':
            return { ...primitive, stroke, fill: null };

        case 'area':
            // `fill` is not optional on an area, so the poché is painted in nothing rather than
            // left out — the rings are what carries the shape and they are stroked instead.
            return { ...primitive, stroke, fill: TRANSPARENT };

        case 'arc':
            return { ...primitive, stroke };

        case 'text':
            // A label has no outline to draw, so it is simply re-set in the marking colour,
            // landing exactly on the one underneath it.
            return { ...primitive, fill: colour };
    }
}
