import { describe, expect, it } from 'vitest';

import { polygonArea } from '@/editor/geometry/polygon';
import { point, type Point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createWall } from '@/editor/model/factories';
import { roomAround } from '@/editor/model/rooms';
import type { HashiraDocument, WallElement } from '@/editor/model/types';

const LAYER = 'layer_architecture';

function drawingOf(walls: readonly WallElement[]): HashiraDocument {
    return { ...emptyDocument('Test'), elements: [...walls] };
}

/** A closed rectangle of walls, drawn corner to corner the way the wall tool chains them. */
function box(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    thickness = 200,
): WallElement[] {
    const corners: Point[] = [
        point(minX, minY),
        point(maxX, minY),
        point(maxX, maxY),
        point(minX, maxY),
    ];

    return corners.map((from, index) =>
        createWall(from, corners[(index + 1) % corners.length]!, LAYER, thickness),
    );
}

/** The ring's corners, ordered so a test can compare them without minding where it starts. */
function sorted(points: readonly Point[]): Point[] {
    return [...points].sort((one, other) => one.x - other.x || one.y - other.y);
}

describe('finding a room', () => {
    it('runs along the inside faces of the walls around the point', () => {
        const drawing = drawingOf(box(0, 0, 6000, 4000));
        const room = roomAround(drawing, point(3000, 2000));

        expect(room).not.toBeNull();
        expect(sorted(room ?? [])).toEqual([
            point(100, 100),
            point(100, 3900),
            point(5900, 100),
            point(5900, 3900),
        ]);
    });

    // The seeded demo plan, whose walls are drawn as two pairs meeting head to head rather
    // than chained one after another. A room is a room however it was drawn.
    it('does not mind which way round the walls were drawn', () => {
        const drawing = drawingOf([
            createWall(point(0, 0), point(4000, 0), LAYER, 150),
            createWall(point(4000, 0), point(4000, 4000), LAYER, 150),
            createWall(point(0, 4000), point(4000, 4000), LAYER, 150),
            createWall(point(0, 4000), point(0, 0), LAYER, 150),
        ]);

        expect(polygonArea(roomAround(drawing, point(2000, 2000)) ?? [])).toBeCloseTo(
            3850 * 3850,
            -1,
        );
    });

    it('gives back nothing at all outside the walls', () => {
        const drawing = drawingOf(box(0, 0, 6000, 4000));

        expect(roomAround(drawing, point(9000, 2000))).toBeNull();
        expect(roomAround(drawing, point(3000, -500))).toBeNull();
    });

    it('finds the smaller space when a partition divides one', () => {
        const drawing = drawingOf([
            ...box(0, 0, 6000, 4000),
            createWall(point(4000, 0), point(4000, 4000), LAYER, 100),
        ]);

        const left = roomAround(drawing, point(1000, 2000)) ?? [];
        const right = roomAround(drawing, point(5000, 2000)) ?? [];

        // 3.85 m by 3.8 m and 1.85 m by 3.8 m: the partition's own thickness belongs to
        // neither of them, and each room stops at its own face of it.
        expect(polygonArea(left)).toBeCloseTo(3850 * 3800, -1);
        expect(polygonArea(right)).toBeCloseTo(1850 * 3800, -1);
    });

    it('meets a thin partition and a thick outer wall where their faces cross', () => {
        const drawing = drawingOf([
            ...box(0, 0, 6000, 4000, 250),
            createWall(point(4000, 0), point(4000, 4000), LAYER, 100),
        ]);

        const right = roomAround(drawing, point(5000, 2000)) ?? [];

        expect(sorted(right)).toEqual([
            point(4050, 125),
            point(4050, 3875),
            point(5875, 125),
            point(5875, 3875),
        ]);
    });

    it('ignores a stub that encloses nothing', () => {
        const drawing = drawingOf([
            ...box(0, 0, 6000, 4000),
            createWall(point(3000, 0), point(3000, 1500), LAYER, 100),
        ]);

        const room = roomAround(drawing, point(1000, 3000));

        // The stub sticks into the space; it does not divide it, so the room is the whole box.
        expect(polygonArea(room ?? [])).toBeCloseTo(5800 * 3800, -1);
    });

    it('finds nothing in a room with a wall missing', () => {
        const walls = box(0, 0, 6000, 4000);

        expect(roomAround(drawingOf(walls.slice(0, 3)), point(3000, 2000))).toBeNull();
    });

    it('is not confused by a wall drawn across the middle of another', () => {
        // The partition crosses the box's top wall and runs on past it.
        const drawing = drawingOf([
            ...box(0, 0, 6000, 4000),
            createWall(point(4000, -1000), point(4000, 4000), LAYER, 100),
        ]);

        expect(polygonArea(roomAround(drawing, point(5000, 2000)) ?? [])).toBeCloseTo(
            1850 * 3800,
            -1,
        );
    });
});
