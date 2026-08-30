import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { distance, point } from '@/editor/geometry/vec';

import { emptyDocument, parseDocument } from './document';
import {
    dimensionFrame,
    dimensionStrokes,
    elementBounds,
    hitTestElement,
    makeLookup,
} from './elements';
import { createDimension, DEFAULT_DIMENSION_SIZE } from './factories';
import { setDimensionOffset, setDimensionSize } from './edits';
import type { DimensionElement } from './types';

const LAYER = 'layer_dimensions';
const NO_LOOKUP = makeLookup([]);

/** A 6 m measurement running left to right, its line 800 mm below what it measures. */
function horizontal(offset = 800): DimensionElement {
    return createDimension(point(0, 0), point(6000, 0), offset, LAYER);
}

describe('what a dimension measures', () => {
    it('reads the distance off the two points rather than storing it', () => {
        const frame = dimensionFrame(horizontal());

        expect(frame?.length).toBe(6000);

        // Nothing in the stored element is the number 6000; it exists only when asked for.
        expect(JSON.stringify(horizontal().geometry)).not.toContain('6000');
    });

    it('follows the points when the element is moved, without being told', () => {
        const moved: DimensionElement = {
            ...horizontal(),
            geometry: { ...horizontal().geometry, b: point(4000, 0) },
        };

        expect(dimensionFrame(moved)?.length).toBe(distance(point(-3000, 0), point(4000, 0)));
    });

    it('has no frame at all when there is nothing between the points', () => {
        expect(dimensionFrame(createDimension(point(0, 0), point(0, 0), 500, LAYER))).toBeNull();
    });
});

describe('where a dimension is drawn', () => {
    it('puts its line the offset away, perpendicular to the measurement', () => {
        const frame = dimensionFrame(horizontal(800));

        expect(frame?.lineFrom).toEqual(point(0, 800));
        expect(frame?.lineTo).toEqual(point(6000, 800));
    });

    it('takes the line to the other side when the offset is negative', () => {
        expect(dimensionFrame(horizontal(-800))?.lineFrom.y).toBe(-800);
    });

    it('draws extension lines, a dimension line and a tick at each end', () => {
        // Two ends, one line between them, and the two extension lines that reach out to it.
        expect(dimensionStrokes(dimensionFrame(horizontal())!)).toHaveLength(5);
    });

    it('leaves the extension lines out when the line sits on the measurement itself', () => {
        // Nothing to extend from, so only the dimension line and its two ticks.
        expect(dimensionStrokes(dimensionFrame(horizontal(0))!)).toHaveLength(3);
    });

    it('never writes the value upside down', () => {
        // Right to left is the same measurement seen from the other end; the value still has
        // to read left to right for whoever is holding the sheet.
        const backwards = createDimension(point(6000, 0), point(0, 0), 800, LAYER);
        const rotation = dimensionFrame(backwards)?.textRotation ?? 0;

        expect(Math.abs(rotation)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    });

    it('writes the value along the measurement when it runs at an angle', () => {
        const diagonal = createDimension(point(0, 0), point(1000, 1000), 300, LAYER);

        expect(dimensionFrame(diagonal)?.textRotation).toBeCloseTo(toRadians(45), 6);
    });
});

describe('a dimension as an object on the sheet', () => {
    it('is framed by its whole mark, not just the points it spans', () => {
        const bounds = elementBounds(horizontal(2000), NO_LOOKUP);

        // The line is 2 m away from the measurement, so a box around the two measured points
        // alone would cut the measurement off the page.
        expect(bounds?.maxY).toBeGreaterThan(2000);
    });

    it('can be picked by its dimension line, away from what it measures', () => {
        const element = horizontal(800);

        expect(hitTestElement(element, NO_LOOKUP, point(3000, 800), 20)).toBe(true);
        expect(hitTestElement(element, NO_LOOKUP, point(3000, 400), 20)).toBe(false);
    });

    it('can be picked by an extension line', () => {
        expect(hitTestElement(horizontal(800), NO_LOOKUP, point(0, 500), 20)).toBe(true);
    });
});

describe('editing a dimension', () => {
    it('moves the line from side to side', () => {
        const moved = setDimensionOffset(horizontal(800), -400);

        expect(moved.type === 'dimension' && moved.geometry.offset).toBe(-400);
    });

    it('resizes the value but refuses a size of nothing', () => {
        expect((setDimensionSize(horizontal(), 300) as DimensionElement).geometry.fontSize).toBe(
            300,
        );
        expect((setDimensionSize(horizontal(), 0) as DimensionElement).geometry.fontSize).toBe(
            DEFAULT_DIMENSION_SIZE,
        );
    });
});

describe('a dimension in a saved drawing', () => {
    it('is something the document format accepts back unchanged', () => {
        const element = horizontal();
        const parsed = parseDocument({ ...emptyDocument(), elements: [element] });

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.dropped).toEqual([]);
        expect(parsed.ok && parsed.document.elements[0]).toEqual(element);
    });

    it('is refused when its value would be meaningless', () => {
        const broken = { ...horizontal(), geometry: { ...horizontal().geometry, fontSize: 0 } };
        const parsed = parseDocument({ ...emptyDocument(), elements: [broken] });

        expect(parsed.ok && parsed.dropped).toHaveLength(1);
    });
});
