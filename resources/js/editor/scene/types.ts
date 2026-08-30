import type { Point } from '@/editor/geometry/vec';
import type { TextAlign } from '@/editor/model/types';

/**
 * A drawing, described once and drawn four ways.
 *
 * The screen, a PNG, an SVG file and a PDF all need the same answer to "what shape is a wall
 * with a door in it". Writing that four times guarantees four slightly different answers, so
 * the document is turned into these primitives once and every output consumes them.
 *
 * Coordinates are world millimetres. Nothing here knows about zoom, pixels or page size.
 */

/**
 * Line weight, and the distinction that matters for a drawing.
 *
 * A `pen` is a plotted weight: 0.25 mm on the finished sheet, whatever the drawing's scale,
 * and constant on screen however far you zoom. A `world` width is a real dimension — a 150 mm
 * wall is 150 mm, and it gets smaller as you zoom out because the wall does.
 */
export type StrokeWidth = { kind: 'pen'; mm: number } | { kind: 'world'; mm: number };

export interface Stroke {
    color: string;
    width: StrokeWidth;
    cap?: 'butt' | 'round';
    /** Dash pattern in sheet millimetres. */
    dash?: number[] | null;
}

/** Plotted pen weights, in millimetres on the sheet. */
export const PEN = {
    fine: 0.18,
    normal: 0.25,
    heavy: 0.5,
} as const;

export function pen(color: string, mm: number = PEN.normal, cap?: 'butt' | 'round'): Stroke {
    return cap === undefined
        ? { color, width: { kind: 'pen', mm } }
        : { color, width: { kind: 'pen', mm }, cap };
}

export type ScenePrimitive =
    | {
          kind: 'polyline';
          points: Point[];
          closed: boolean;
          stroke: Stroke | null;
          fill?: string | null;
      }
    | {
          kind: 'circle';
          centre: Point;
          radius: number;
          stroke: Stroke | null;
          fill?: string | null;
      }
    | {
          kind: 'ellipse';
          centre: Point;
          rx: number;
          ry: number;
          stroke: Stroke | null;
          fill?: string | null;
      }
    | {
          kind: 'arc';
          centre: Point;
          radius: number;
          from: number;
          to: number;
          anticlockwise: boolean;
          stroke: Stroke;
      }
    | {
          kind: 'text';
          at: Point;
          content: string;
          /** Cap height in world millimetres. */
          size: number;
          align: TextAlign;
          rotation: number;
          fill: string;
      };

/** Primitives grouped by the layer they came from, so an SVG can keep that structure. */
export interface SceneLayer {
    id: string;
    name: string;
    primitives: ScenePrimitive[];
}

/** The few colours the builder needs that are not carried by the document itself. */
export interface ScenePalette {
    ink: string;
    subtle: string;
    roomFill: string;
}
