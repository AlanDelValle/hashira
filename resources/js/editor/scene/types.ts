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

export interface Stroke {
    color: string;
    /**
     * A plotted pen weight: millimetres on the finished sheet, whatever the drawing's scale.
     * It stays the same thickness on screen however far you zoom, exactly as it would on a
     * plotter. Anything with a real dimension — a wall's poché — is an area and is filled,
     * not stroked, which is why there is only one kind of width here.
     */
    width: number;
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
    return cap === undefined ? { color, width: mm } : { color, width: mm, cap };
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
          /** Rotation of the `rx` axis, clockwise from east, in radians. */
          rotation: number;
          stroke: Stroke | null;
          fill?: string | null;
      }
    | {
          /**
           * One filled shape made of several closed rings — the poché of a whole run of
           * walls. Drawn as one path rather than as a polygon per wall on purpose: two fills
           * that share an edge each cover half of the pixels along it, and the seam of pale
           * hairlines that leaves at every mitre is exactly what cleaning up a corner was
           * supposed to get rid of.
           *
           * Rings are filled by the non-zero rule, so they all have to wind the same way.
           */
          kind: 'area';
          rings: Point[][];
          fill: string;
          stroke: Stroke | null;
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
    /**
     * The paper. A hatch has to be read against something, so a shape that carries one keeps
     * the sheet behind it rather than whatever tint it would otherwise have had.
     */
    sheet: string;
}
