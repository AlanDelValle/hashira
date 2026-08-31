import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';

import { emptyDocument, parseDocument } from './document';
import {
    angleFrame,
    elementBounds,
    hitTestElement,
    leaderFrame,
    makeLookup,
    radiusFrame,
} from './elements';
import { createAngle, createCircle, createLeader, createRadius } from './factories';
import { setRadiusDiameter } from './edits';
import type { CircleElement } from './types';

const LAYER = 'layer_dimensions';
const NO_LOOKUP = makeLookup([]);

/** A quarter turn: a corner at the origin with one leg east and one leg south. */
function corner(radius?: number) {
    return createAngle(point(0, 0), point(1000, 0), point(0, 1000), LAYER, 200, radius);
}

function circle(): CircleElement {
    return { ...createCircle(point(0, 0), 500, 'layer_architecture'), id: 'the-circle' };
}

describe('what an angle measures', () => {
    it('reads the angle off its two legs rather than storing it', () => {
        expect(angleFrame(corner())?.angle).toBeCloseTo(Math.PI / 2, 9);
        expect(JSON.stringify(corner().geometry)).not.toContain('90');
    });

    it('measures the lesser of the two angles a corner offers', () => {
        // Three quarters of a turn the one way is a quarter turn the other, and a quarter
        // turn is what anybody means by this corner.
        const reflex = createAngle(point(0, 0), point(0, 1000), point(1000, 0), LAYER, 200);

        expect(angleFrame(reflex)?.angle).toBeCloseTo(Math.PI / 2, 9);
    });

    it('follows its legs when they move, without being told', () => {
        const shallower = createAngle(point(0, 0), point(1000, 0), point(1000, 1000), LAYER, 200);

        expect(angleFrame(shallower)?.angle).toBeCloseTo(toRadians(45), 9);
    });

    it('strikes its arc inside the shorter leg by default', () => {
        const frame = angleFrame(corner());

        expect(frame?.radius).toBeCloseTo(600);
    });

    it('has no frame at all when a leg has no direction', () => {
        expect(angleFrame(createAngle(point(0, 0), point(0, 0), point(0, 1000), LAYER))).toBeNull();
    });

    it('is picked on its arc as well as on its legs', () => {
        const element = corner();

        // On the arc, a quarter of the way round it, and on the leg that runs east.
        expect(hitTestElement(element, NO_LOOKUP, point(424, 424), 20)).toBe(true);
        expect(hitTestElement(element, NO_LOOKUP, point(400, 0), 20)).toBe(true);

        // Inside the arc, where nothing is drawn.
        expect(hitTestElement(element, NO_LOOKUP, point(200, 200), 20)).toBe(false);
    });

    it('is framed by the whole arc and the value outside it', () => {
        const bounds = elementBounds(corner(), NO_LOOKUP);

        expect(bounds?.maxX).toBeGreaterThan(600);
        expect(bounds?.maxY).toBeGreaterThan(600);
    });
});

describe('what a radius measures', () => {
    const host = circle();
    const lookup = makeLookup([host]);

    it('reads the value off the circle it is hosted on', () => {
        const element = createRadius(host.id, 0, LAYER);

        expect(radiusFrame(element, lookup)?.measured).toBe(500);
    });

    it('follows the circle when it is resized, without being told', () => {
        const element = createRadius(host.id, 0, LAYER);
        const bigger = { ...host, geometry: { radius: 900 } };

        expect(radiusFrame(element, makeLookup([bigger]))?.measured).toBe(900);
    });

    it('measures twice as much when it is switched to a diameter', () => {
        const element = setRadiusDiameter(createRadius(host.id, 0, LAYER), true);

        expect(element.type === 'radius' && radiusFrame(element, lookup)?.measured).toBe(1000);
    });

    it('draws right across the circle for a diameter and out from the centre for a radius', () => {
        const radius = createRadius(host.id, 0, LAYER);
        const diameter = setRadiusDiameter(radius, true);

        expect(radiusFrame(radius, lookup)?.opposite).toEqual(point(0, 0));
        expect(diameter.type === 'radius' ? radiusFrame(diameter, lookup)?.opposite : null).toEqual(
            point(-500, 0),
        );
    });

    it('has no frame at all when its circle is not there', () => {
        expect(radiusFrame(createRadius('gone', 0, LAYER), NO_LOOKUP)).toBeNull();
    });

    it('is dropped on load when the circle it belongs to is missing', () => {
        const parsed = parseDocument({
            ...emptyDocument(),
            elements: [createRadius('gone', 0, LAYER)],
        });

        expect(parsed.ok && parsed.dropped).toHaveLength(1);
        expect(parsed.ok && parsed.document.elements).toEqual([]);
    });
});

describe('a note with a line to what it is about', () => {
    const note = createLeader([point(0, 0), point(500, -500), point(1200, -500)], 'Tiled', LAYER);

    it('puts its arrowhead at the thing it points at', () => {
        expect(leaderFrame(note)?.tip).toEqual(point(0, 0));
        expect(leaderFrame(note)?.barbs).toHaveLength(2);
    });

    it('writes the note away from the bend, so the words never sit back over the line', () => {
        expect(leaderFrame(note)?.align).toBe('left');

        const leftwards = createLeader(
            [point(0, 0), point(-500, -500), point(-1200, -500)],
            'Tiled',
            LAYER,
        );

        expect(leaderFrame(leftwards)?.align).toBe('right');
    });

    it('is picked along its line and at its words', () => {
        expect(hitTestElement(note, NO_LOOKUP, point(250, -250), 20)).toBe(true);
        expect(hitTestElement(note, NO_LOOKUP, point(250, 400), 20)).toBe(false);
    });

    it('is refused by the format when there is nothing written on it', () => {
        const blank = { ...note, geometry: { ...note.geometry, content: '' } };
        const parsed = parseDocument({ ...emptyDocument(), elements: [blank] });

        expect(parsed.ok && parsed.dropped).toHaveLength(1);
    });
});

describe('the marks in a saved drawing', () => {
    it('are what the document format accepts back unchanged', () => {
        const host = circle();
        const elements = [
            host,
            corner(),
            createRadius(host.id, toRadians(30), LAYER),
            createLeader([point(0, 0), point(500, -500)], 'Tiled', LAYER),
        ];

        const parsed = parseDocument({ ...emptyDocument(), elements });

        expect(parsed.ok && parsed.dropped).toEqual([]);
        expect(parsed.ok && parsed.document.elements).toEqual(elements);
    });
});
