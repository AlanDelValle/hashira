import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { wallSegment } from '@/editor/model/elements';
import { wallJoins } from '@/editor/model/walls';

import { roomFromArea, roomWalls } from './areaTool';

const TWELVE = 12_000_000;
const ANCHOR = point(0, 0);

/** The inside area the rectangle actually came out at, in square millimetres. */
function area(width: number, height: number): number {
    return width * height;
}

describe('a room drawn from its area', () => {
    it('holds the area while the pointer changes the shape', () => {
        const wide = roomFromArea(ANCHOR, point(4000, 1000), TWELVE, 0);
        const tall = roomFromArea(ANCHOR, point(1000, 4000), TWELVE, 0);

        expect(area(wide.width, wide.height)).toBeCloseTo(TWELVE);
        expect(area(tall.width, tall.height)).toBeCloseTo(TWELVE);

        // Same area, different room. That is the whole tool.
        expect(wide.width).toBeGreaterThan(wide.height);
        expect(tall.height).toBeGreaterThan(tall.width);
    });

    it('does not grow when the pointer is pushed further along the same ray', () => {
        const near = roomFromArea(ANCHOR, point(300, 400), TWELVE, 0);
        const far = roomFromArea(ANCHOR, point(3000, 4000), TWELVE, 0);

        expect(far.width).toBeCloseTo(near.width);
        expect(far.height).toBeCloseTo(near.height);
    });

    it('follows the pointer into whichever quarter it is in', () => {
        const room = roomFromArea(ANCHOR, point(-1000, -1000), TWELVE, 0);

        expect(room.to.x).toBeLessThan(0);
        expect(room.to.y).toBeLessThan(0);
    });

    it('squares up when the pointer is on the diagonal', () => {
        const room = roomFromArea(ANCHOR, point(1000, 1000), TWELVE, 0);

        expect(room.width).toBeCloseTo(Math.sqrt(TWELVE));
        expect(room.height).toBeCloseTo(room.width);
    });

    /*
     * A pointer on the same row as its own anchor asks for a room of no depth, which is a
     * division by zero wearing a hat. The proportion is held to twenty to one instead, which
     * is already a corridor.
     */
    it('refuses to be pushed past a corridor', () => {
        const room = roomFromArea(ANCHOR, point(4000, 0), TWELVE, 0);

        expect(Number.isFinite(room.width)).toBe(true);
        expect(room.width / room.height).toBeCloseTo(20);
        expect(area(room.width, room.height)).toBeCloseTo(TWELVE);
    });

    /*
     * The grid rounds the inside dimensions, so the area that comes out is not the area that
     * went in. That is deliberate and it is why nothing stores the request: 3.464 m square is
     * exactly twelve metres and nobody builds it, 3.5 by 3.4 is 11.9 and somebody does.
     */
    it('rounds the room to the grid and reports what that came to', () => {
        const room = roomFromArea(ANCHOR, point(1000, 1000), TWELVE, 100);

        expect(room.width % 100).toBe(0);
        expect(room.height % 100).toBe(0);
        expect(area(room.width, room.height)).not.toBeCloseTo(TWELVE);
    });

    it('leaves the dimensions alone when nothing is snapping', () => {
        const room = roomFromArea(ANCHOR, point(1000, 1000), TWELVE, 0);

        expect(room.width % 100).not.toBe(0);
    });
});

describe('the walls put round it', () => {
    const room = roomFromArea(ANCHOR, point(4000, 3000), TWELVE, 0);
    const walls = roomWalls(room, 150, 'layer_architecture');

    it('makes four of them', () => {
        expect(walls).toHaveLength(4);
    });

    /*
     * The area asked for is the floor somebody walks on, so the centrelines sit half a
     * thickness outside it. Checked through the joins rather than by arithmetic: the faces
     * these four walls actually get mitred to are what a tape measure would find.
     */
    it('encloses the area that was asked for, measured on the inside', () => {
        const bands = wallJoins(walls).bands;
        const inside = walls.map((wall) => {
            const band = bands.get(wall.id);

            // The inside face of a closed rectangle is the one that pulls back at both ends.
            return Math.min(
                (band?.endLeft ?? 0) - (band?.startLeft ?? 0),
                (band?.endRight ?? 0) - (band?.startRight ?? 0),
            );
        });

        expect(inside[0]).toBeCloseTo(room.width);
        expect(inside[1]).toBeCloseTo(room.height);
        expect((inside[0] ?? 0) * (inside[1] ?? 0)).toBeCloseTo(TWELVE);
    });

    it('closes the ring, so every corner is one point two walls share', () => {
        const ends = walls.map((wall) => wallSegment(wall));

        for (const [index, segment] of ends.entries()) {
            const next = ends[(index + 1) % ends.length];

            expect(next?.a.x).toBeCloseTo(segment.b.x);
            expect(next?.a.y).toBeCloseTo(segment.b.y);
        }
    });

    it('mitres at all four corners rather than overlapping', () => {
        // Four corners, each shared by two walls and neither of them square any more.
        expect(wallJoins(walls).bands.get(walls[0]?.id ?? '')?.startLeft).not.toBe(0);
    });
});
