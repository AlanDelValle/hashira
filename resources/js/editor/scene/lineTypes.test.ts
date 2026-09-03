import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import {
    createCircle,
    createLine,
    createPolygon,
    createRect,
    createWall,
} from '@/editor/model/factories';
import { LINE_WEIGHTS } from '@/editor/model/lineTypes';
import type { Element, LineType } from '@/editor/model/types';

import { buildScene } from './build';
import type { ScenePrimitive, Stroke } from './types';

const PALETTE = { ink: '#17191d', subtle: '#5f636b', roomFill: '#f2f5fc', sheet: '#ffffff' };
const LAYER = 'layer_architecture';

function typed<T extends Element>(element: T, lineType: LineType): T {
    return { ...element, style: { ...element.style, lineType } };
}

function primitives(elements: Element[]): ScenePrimitive[] {
    return buildScene(elements, defaultLayers(), { palette: PALETTE }).flatMap(
        (layer) => layer.primitives,
    );
}

function strokeOf(elements: Element[]): Stroke | null {
    const first = primitives(elements)[0];

    return first !== undefined && 'stroke' in first ? first.stroke : null;
}

const line = () => createLine(point(0, 0), point(3000, 0), LAYER);

describe('a shape drawn with a line type', () => {
    /*
     * The default is the point of the default: a line, a rectangle, a polygon and a circle
     * were already drawn at 0.25 mm solid, which is exactly contínua larga. Naming it changes
     * nothing, so no drawing made before line types existed is restyled by them.
     */
    it('is drawn exactly as it always was when it names none', () => {
        const stroke = strokeOf([line()]);

        // The same two keys `pen()` has always returned, and no third one snuck in beside them.
        expect(Object.keys(stroke ?? {}).sort()).toEqual(['color', 'width']);
        expect(stroke?.width).toBe(LINE_WEIGHTS.wide);
    });

    it('is drawn exactly as it always was when it names the default', () => {
        expect(strokeOf([typed(line(), 'continuous-wide')])).toEqual(strokeOf([line()]));
    });

    it('takes the pattern and the weight together', () => {
        const stroke = strokeOf([typed(line(), 'dashed-narrow')]);

        expect(stroke?.width).toBe(LINE_WEIGHTS.narrow);
        expect(stroke?.dash).toEqual([3, 0.75]);
    });

    it('carries a weight with no pattern for a continuous one', () => {
        const stroke = strokeOf([typed(line(), 'continuous-extra-wide')]);

        expect(stroke?.width).toBe(LINE_WEIGHTS['extra-wide']);
        expect(stroke?.dash).toBeUndefined();
    });

    /*
     * The same convention at two weights is two entries in the standard's table and has to be
     * two marks on the sheet: a section plane found before the centre lines around it.
     */
    it('tells a dash-dot at one weight from the same dash-dot at another', () => {
        const narrow = strokeOf([typed(line(), 'dash-dot-narrow')]);
        const wide = strokeOf([typed(line(), 'dash-dot-extra-wide')]);

        expect(narrow?.dash).toEqual(wide?.dash);
        expect(narrow?.width).not.toBe(wide?.width);
    });

    it('reaches the rectangle, the polygon and the circle as well as the line', () => {
        const triangle = createPolygon(
            [point(0, 0), point(1000, 0), point(1000, 1000)],
            true,
            LAYER,
        );

        if (triangle === null) {
            throw new Error('three corners are a polygon');
        }

        const shapes: Element[] = [
            createRect(point(0, 0), point(2000, 1000), LAYER),
            triangle,
            createCircle(point(0, 0), 500, LAYER),
        ];

        for (const shape of shapes) {
            expect(strokeOf([typed(shape, 'dashed-narrow')])?.dash, shape.type).toEqual([3, 0.75]);
        }
    });

    /*
     * A wall, an opening, a room and a dimension are not asked. What those mean is decided by
     * what they are, and 12.1 is deliberately not a restyling of the drawing — so a lineType
     * that finds its way onto one changes nothing about how it is drawn.
     */
    it('leaves a wall drawn the way a wall is drawn', () => {
        const marked = {
            ...createWall(point(0, 0), point(4000, 0), LAYER, 200),
            style: { hatch: 'new' as const },
        };
        const alsoTyped = typed(marked, 'dash-dot-extra-wide');

        expect(strokeOf([alsoTyped])).toEqual(strokeOf([marked]));
        expect(strokeOf([alsoTyped])?.dash).toBeUndefined();
    });
});
