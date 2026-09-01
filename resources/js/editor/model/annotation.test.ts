import { describe, expect, it } from 'vitest';

import { toRadians } from '@/editor/geometry/angle';
import { point } from '@/editor/geometry/vec';

import { buildScene } from '@/editor/scene/build';

import { defaultLayers, emptyDocument, parseDocument } from './document';
import {
    angleFrame,
    cloudBumps,
    elementBounds,
    elementSize,
    elementWorldPoints,
    hitTestElement,
    leaderFrame,
    makeLookup,
    radiusFrame,
} from './elements';
import {
    createAngle,
    createCircle,
    createCloud,
    createLeader,
    createRadius,
    createUnderlay,
} from './factories';
import { setRadiusDiameter, setUnderlayOpacity } from './edits';
import type { CircleElement, CloudElement, UnderlayElement } from './types';

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

describe('a page to trace over', () => {
    const page = createUnderlay('page-1', point(0, 0), 841, 594);

    it('is placed at the page’s own size, centred where it was put', () => {
        expect(elementSize(page)).toEqual({ width: 841, height: 594 });
        expect(elementWorldPoints(page, NO_LOOKUP)).toHaveLength(4);
    });

    it('is drawn back far enough that a line over it reads as the drawing', () => {
        expect(page.geometry.opacity).toBeLessThan(0.6);
        expect(page.geometry.opacity).toBeGreaterThan(0.2);
    });

    it('is picked anywhere on the paper, not only at its edge', () => {
        expect(hitTestElement(page, NO_LOOKUP, point(0, 0), 20)).toBe(true);
        expect(hitTestElement(page, NO_LOOKUP, point(2000, 0), 20)).toBe(false);
    });

    it('keeps its opacity between nothing and all of it', () => {
        expect((setUnderlayOpacity(page, 4) as UnderlayElement).geometry.opacity).toBe(1);
        expect((setUnderlayOpacity(page, -1) as UnderlayElement).geometry.opacity).toBe(0);
    });

    /*
     * The scene is what every output consumes, and a page traced over is not part of the
     * drawing: it is usually somebody else's survey, and a plan that quietly carries it into
     * a PDF is a plan nobody can publish.
     */
    it('is not in the scene at all, so no export can contain it', () => {
        const scene = buildScene([page], defaultLayers(), {
            palette: { ink: '#000', subtle: '#666', roomFill: '#eee' },
        });

        expect(scene).toEqual([]);
    });

    it('is something the document format accepts back unchanged', () => {
        // On the layer the import makes for it: a drawing that has never traced anything does
        // not carry an empty underlay layer around for the possibility.
        const blank = emptyDocument();
        const parsed = parseDocument({
            ...blank,
            layers: [
                {
                    id: 'layer_underlay',
                    name: 'Underlay',
                    color: '#5F636B',
                    visible: true,
                    locked: false,
                    order: -1,
                },
                ...blank.layers,
            ],
            elements: [page],
        });

        expect(parsed.ok && parsed.dropped).toEqual([]);
        expect(parsed.ok && parsed.document.elements[0]).toEqual(page);
    });
});

describe('a revision cloud', () => {
    /** A four metre square, wound anticlockwise on screen. */
    const SQUARE = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)];

    function cloud(radius = 200): CloudElement {
        const made = createCloud(SQUARE, LAYER, radius);

        expect(made).not.toBeNull();

        return made!;
    }

    it('needs something to go round', () => {
        expect(createCloud([point(0, 0), point(100, 0)], LAYER)).toBeNull();
    });

    /*
     * The whole point of the mark: it surrounds what changed. Bumps that scalloped inward
     * would eat into the drawing they are pointing at, and would still look like a cloud in a
     * thumbnail.
     */
    it('bulges outward, so it surrounds the run rather than biting into it', () => {
        const bumps = cloudBumps(cloud());
        const apexes = bumps.map((bump) => {
            const middle = bump.from + normalisedHalf(bump.from, bump.to, bump.anticlockwise);

            return {
                x: bump.centre.x + bump.radius * Math.cos(middle),
                y: bump.centre.y + bump.radius * Math.sin(middle),
            };
        });

        // Every apex is outside the square, which is what "outward" means for a closed run.
        const outside = apexes.filter((at) => at.x < -1 || at.x > 4001 || at.y < -1 || at.y > 4001);

        expect(outside).toHaveLength(apexes.length);
    });

    it('divides each side into whole bumps of the size it was given', () => {
        const bumps = cloudBumps(cloud(200));

        // Four sides of four metres, in bumps four hundred across: ten a side.
        expect(bumps).toHaveLength(40);

        // Half the size, twice as many.
        expect(cloudBumps(cloud(100))).toHaveLength(80);
    });

    it('reaches past the run it is struck on, and its extent says so', () => {
        const bounds = elementBounds(cloud(200), NO_LOOKUP);

        expect(bounds?.minX).toBeLessThan(0);
        expect(bounds?.maxY).toBeGreaterThan(4000);
    });

    /*
     * A cloud is a mark about the drawing, not a shape in it. Drawing the run it is struck on
     * would put a closed outline around part of a plan, which reads as something built.
     */
    it('draws as bumps and never as the outline underneath them', () => {
        const [layer] = buildScene([cloud()], defaultLayers(), {
            palette: { ink: '#000', subtle: '#555', roomFill: '#eee' },
        });

        expect(layer?.primitives.every((primitive) => primitive.kind === 'arc')).toBe(true);
        expect(layer?.primitives).toHaveLength(40);
    });

    it('is picked anywhere along its run', () => {
        const drawn = cloud();

        expect(hitTestElement(drawn, NO_LOOKUP, point(2000, 0), 50)).toBe(true);
        expect(hitTestElement(drawn, NO_LOOKUP, point(2000, 2000), 50)).toBe(false);
    });

    it('survives a save and a load', () => {
        const drawing = { ...emptyDocument('Plan'), elements: [cloud()] };
        const parsed = parseDocument(JSON.parse(JSON.stringify(drawing)));

        expect(parsed.ok && parsed.dropped).toEqual([]);
        expect(parsed.ok && parsed.document.elements[0]?.type).toBe('cloud');
    });
});

/** Halfway along the arc, in the direction it is actually drawn. */
function normalisedHalf(from: number, to: number, anticlockwise: boolean): number {
    const forward = (((to - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    return anticlockwise ? -(Math.PI * 2 - forward) / 2 : forward / 2;
}
