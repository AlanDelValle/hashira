import { describe, expect, it } from 'vitest';

import { boundsIntersect, expandBounds, type Bounds } from '@/editor/geometry/bbox';
import { point } from '@/editor/geometry/vec';
import { ASSET_LIBRARY } from '@/editor/assets/library';

import { documentIndex } from './documentIndex';
import { emptyDocument } from './document';
import { elementBounds, hitTestElement, makeLookup } from './elements';
import { createAsset, createDoor, createRect, createWall } from './factories';
import { pickAt, pickInBounds } from './picking';
import type { Element, HashiraDocument } from './types';

/**
 * A plan of a given size, laid out as a grid of rooms so that elements are spread over a real
 * extent rather than piled on the origin — which is the case the index exists for.
 */
function plan(rooms: number): HashiraDocument {
    const document = emptyDocument('Index');
    const elements: Element[] = [];
    const side = Math.ceil(Math.sqrt(rooms));

    for (let n = 0; n < rooms; n++) {
        const x = (n % side) * 4000;
        const y = Math.floor(n / side) * 3500;

        const wall = createWall(point(x, y), point(x + 4000, y), 'layer_architecture');
        const asset = ASSET_LIBRARY[n % ASSET_LIBRARY.length];

        elements.push(wall);
        elements.push(createWall(point(x, y), point(x, y + 3500), 'layer_architecture'));
        elements.push(createDoor(wall.id, 1200, 'layer_openings'));
        elements.push(
            createRect(point(x + 500, y + 500), point(x + 1500, y + 1200), 'layer_furniture'),
        );

        if (asset !== undefined) {
            elements.push(createAsset(asset, point(x + 2000, y + 1700)));
        }
    }

    return { ...document, elements };
}

/** The obvious, slow answer, which the index has to agree with exactly. */
function bruteForceNear(drawing: HashiraDocument, area: Bounds): Element[] {
    const lookup = makeLookup(drawing.elements);

    return drawing.elements.filter((element) => {
        const bounds = elementBounds(element, lookup);

        return bounds === null || boundsIntersect(bounds, area);
    });
}

describe('the document index', () => {
    it('finds exactly what a full scan would find', () => {
        const drawing = plan(120);
        const index = documentIndex(drawing);

        for (const area of [
            { minX: 0, minY: 0, maxX: 100, maxY: 100 },
            { minX: 8000, minY: 7000, maxX: 20000, maxY: 16000 },
            { minX: -50000, minY: -50000, maxX: 90000, maxY: 90000 },
            { minX: 3900, minY: 3400, maxX: 4100, maxY: 3600 },
        ]) {
            expect(index.near(area)).toEqual(bruteForceNear(drawing, area));
        }
    });

    it('answers a small query with a small number of elements', () => {
        const drawing = plan(200);
        const index = documentIndex(drawing);

        const near = index.near({ minX: 0, minY: 0, maxX: 200, maxY: 200 });

        // The point of the thing: a query the size of a snap tolerance must not come back
        // with a meaningful fraction of a thousand-element drawing.
        expect(near.length).toBeLessThan(drawing.elements.length / 20);
    });

    it('returns what it finds in document order', () => {
        const drawing = plan(40);
        const index = documentIndex(drawing);
        const found = index.near({ minX: 0, minY: 0, maxX: 20000, maxY: 20000 });

        const positions = found.map((element) => drawing.elements.indexOf(element));

        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('is the same index for the same document and a new one for the next version', () => {
        const drawing = plan(10);
        const next = { ...drawing, elements: drawing.elements.slice(0, 5) };

        expect(documentIndex(drawing)).toBe(documentIndex(drawing));
        expect(documentIndex(next)).not.toBe(documentIndex(drawing));
        expect(
            documentIndex(next).near({ minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }),
        ).toHaveLength(5);
    });

    it('measures an element that is not in the document rather than caching a stale answer', () => {
        const drawing = plan(4);
        const index = documentIndex(drawing);
        const original = drawing.elements[0] as Element;

        const moved: Element = {
            ...original,
            transform: { ...original.transform, x: original.transform.x + 50000 },
        };

        expect(index.bounds(moved)).not.toEqual(index.bounds(original));
    });
});

describe('picking through the index', () => {
    it('picks the same element a full top-down scan would', () => {
        const drawing = plan(60);
        const lookup = makeLookup(drawing.elements);
        const tolerance = 60;

        for (const at of [point(0, 0), point(2000, 0), point(1000, 700), point(2000, 1700)]) {
            const expected = [...drawing.elements]
                .reverse()
                .find((element) => hitTestElement(element, lookup, at, tolerance));

            expect(pickAt(drawing, at, tolerance)?.id).toBe(expected?.id);
        }
    });

    it('finds nothing where there is nothing', () => {
        expect(pickAt(plan(20), point(-90000, -90000), 60)).toBeNull();
    });

    it('takes the same elements in a marquee as a full scan', () => {
        const drawing = plan(60);
        const area: Bounds = { minX: -100, minY: -100, maxX: 9000, maxY: 5000 };
        const lookup = makeLookup(drawing.elements);

        const expected = drawing.elements
            .filter((element) => {
                const bounds = elementBounds(element, lookup);

                return bounds !== null && boundsIntersect(bounds, area);
            })
            .map((element) => element.id);

        expect(pickInBounds(drawing, area, 'crossing').map((element) => element.id)).toEqual(
            expected,
        );
    });
});

/**
 * The scaling claim, checked rather than assumed.
 *
 * Timings are noisy, so this asks a deliberately loose question: does a hover on a plan ten
 * times the size cost roughly the same, or ten times as much? Anything that walks the whole
 * drawing again lands nearer the second, well outside the margin here.
 */
describe('the cost of a pointer move', () => {
    function hoverCost(drawing: HashiraDocument, runs: number): number {
        const at = point(2000, 1700);
        const area = expandBounds({ minX: at.x, minY: at.y, maxX: at.x, maxY: at.y }, 60);

        // Warm the index, which is built once per document and not per move.
        documentIndex(drawing).near(area);
        pickAt(drawing, at, 60);

        const started = performance.now();

        for (let run = 0; run < runs; run++) {
            pickAt(drawing, at, 60);
            documentIndex(drawing).near(area);
        }

        return performance.now() - started;
    }

    it('barely grows when the drawing grows tenfold', () => {
        const small = plan(30);
        const large = plan(300);

        expect(large.elements.length).toBeGreaterThan(small.elements.length * 9);

        const runs = 3000;
        const cost = hoverCost(large, runs) / Math.max(hoverCost(small, runs), 0.001);

        expect(cost).toBeLessThan(4);
    });
});
