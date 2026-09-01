import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { defaultLayers } from '@/editor/model/document';
import { makeLookup } from '@/editor/model/elements';
import { createDoor, createWall } from '@/editor/model/factories';
import type { Element } from '@/editor/model/types';
import { wallJoins } from '@/editor/model/walls';

import { paintHover, paintSelection, type OverlayContext } from './overlay';
import type { CanvasTheme } from './theme';

const THEME: CanvasTheme = {
    sheet: '#ffffff',
    gridMinor: '#e9e7e2',
    gridMajor: '#d8d5ce',
    ink: '#17191d',
    inkMuted: '#4d5158',
    inkSubtle: '#686c74',
    line: '#e5e3de',
    accent: '#2c58c4',
    accentSoft: '#ecf1fc',
    positive: '#1a7f4b',
    danger: '#b3261e',
    caution: '#8a6b00',
};

const DOOR_WIDTH = 900;

/**
 * A wall with a door in it, on the layers each would really be drawn on — the door's host is
 * not even on the same layer, which is exactly the case a highlight has to survive.
 */
const WALL: Element = {
    ...createWall(point(0, 0), point(4000, 0), 'layer_architecture'),
    id: 'wall',
};

const DOOR: Element = {
    ...createDoor('wall', 1000, 'layer_openings', DOOR_WIDTH),
    id: 'door',
};

interface Call {
    name: string;
    args: unknown[];
}

/** A canvas that draws nothing and remembers what it was asked to draw. */
function recordingContext(): { calls: Call[]; ctx: CanvasRenderingContext2D } {
    const calls: Call[] = [];

    const ctx = new Proxy(
        {},
        {
            get:
                (_target, property) =>
                (...args: unknown[]): void => {
                    calls.push({ name: String(property), args });
                },
            set: () => true,
        },
    ) as CanvasRenderingContext2D;

    return { calls, ctx };
}

/** The radius of every arc struck on the canvas — `ctx.arc(x, y, radius, …)`. */
function arcRadii(calls: readonly Call[]): number[] {
    return calls.flatMap((call) => (call.name === 'arc' ? [call.args[2] as number] : []));
}

function overlay(ctx: CanvasRenderingContext2D): OverlayContext {
    return {
        ctx,
        theme: THEME,
        palette: { ink: THEME.ink, subtle: THEME.inkSubtle, roomFill: THEME.accentSoft },
        layers: defaultLayers(),
        // The whole drawing, the way the renderer passes it: what is highlighted is a
        // fragment of the document, and it still has to be able to find the rest.
        lookup: makeLookup([WALL, DOOR]),
        joins: wallJoins([WALL]),
        unit: 'm',
        px: 1,
    };
}

describe('the selection overlay', () => {
    it('paints a door selected on its own, without its wall', () => {
        const { calls, ctx } = recordingContext();

        paintSelection(overlay(ctx), [DOOR]);

        // The swing is struck at the door's own width, which nothing else on the overlay
        // draws: the selection box is a rectangle and the rotation handle is a few pixels.
        expect(arcRadii(calls)).toContain(DOOR_WIDTH);
    });

    it('paints a door hovered on its own, without its wall', () => {
        const { calls, ctx } = recordingContext();

        paintHover(overlay(ctx), DOOR);

        expect(arcRadii(calls)).toContain(DOOR_WIDTH);
    });

    it('still paints a wall selected on its own', () => {
        const { calls, ctx } = recordingContext();

        paintSelection(overlay(ctx), [WALL]);

        expect(calls.some((call) => call.name === 'fill')).toBe(true);
    });
});
