import { unionBounds, type Bounds } from '@/editor/geometry/bbox';
import type { Point } from '@/editor/geometry/vec';
import type { DocumentDiff } from '@/editor/model/diff';
import { documentBounds, elementBounds, makeLookup } from '@/editor/model/elements';
import type { HashiraDocument } from '@/editor/model/types';
import { wallJoins } from '@/editor/model/walls';
import { buildScene } from '@/editor/scene/build';
import type { SceneLayer } from '@/editor/scene/types';
import {
    centreOn,
    DEFAULT_ZOOM,
    fitBounds,
    panByScreen,
    zoomAt,
    type CanvasSize,
    type Viewport,
} from '@/editor/viewport/viewport';

import { paintScene } from './canvasScene';
import { buildRedlines } from './redlines';
import { readTheme, type CanvasTheme } from './theme';

/**
 * A drawing you can look at but not touch, and what changed in it.
 *
 * The editor's renderer reads the stores — the document being edited, the selection, the tool,
 * the drag in progress — because that is exactly what it is for. A version is none of those
 * things: it is a drawing that is not open, and putting one into those stores to look at it
 * would mean the drawing somebody is working on is not the one on the screen.
 *
 * So this is a second, much smaller surface that owns everything it paints. It takes a
 * document, paints it through the same scene builder the editor and the exporters use, and
 * marks the comparison over the top. It has its own viewport, pans and zooms itself, and
 * touches no store at all.
 *
 * What it deliberately leaves out is the paper: no grid, no sheet outline, no underlay. Those
 * are for drafting on, and nothing here is being drafted.
 */

/** One wheel notch, matching the editor's. */
const ZOOM_STEP = 1.12;

/** A version is looked at whole, so it sits closer to the edges than a drawing being drawn. */
const FRAME_PADDING_PX = 24;

export interface ReviewContent {
    /** The version on show. When two are being compared, the later of them. */
    drawing: HashiraDocument;
    /** The earlier version, when there is a comparison: where a deleted element still is. */
    against: HashiraDocument | null;
    diff: DocumentDiff | null;
}

export class ReviewSurface {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D | null;

    private theme: CanvasTheme;
    private viewport: Viewport = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
    private size: CanvasSize = { width: 0, height: 0 };

    private content: ReviewContent | null = null;
    private drawing: SceneLayer[] = [];
    private redlines: SceneLayer[] = [];

    private animation = 0;
    private dirty = true;
    private dpr = 1;
    private needsFraming = false;
    private panningFrom: Point | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.theme = readTheme(window.document.documentElement);
    }

    start(): void {
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointercancel', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

        this.loop();
    }

    stop(): void {
        cancelAnimationFrame(this.animation);

        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
    }

    resize(width: number, height: number): void {
        this.dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

        this.canvas.width = Math.max(1, Math.round(width * this.dpr));
        this.canvas.height = Math.max(1, Math.round(height * this.dpr));
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        this.theme = readTheme(window.document.documentElement);
        this.size = { width, height };
        this.dirty = true;
    }

    /**
     * Put a version on the surface, and frame it.
     *
     * Both scenes are built here rather than once a frame: nothing on this surface moves, so a
     * pan costs a repaint instead of rebuilding the whole drawing. The framing is deferred to
     * the next paint, because the canvas may not have been given a size yet.
     */
    show(content: ReviewContent | null): void {
        this.content = content;
        this.drawing = content === null ? [] : this.buildDrawing(content.drawing);

        this.redlines =
            content === null || content.diff === null || content.against === null
                ? []
                : buildRedlines(content.diff, content.against, content.drawing, {
                      added: this.theme.positive,
                      removed: this.theme.danger,
                      changed: this.theme.caution,
                  });

        this.needsFraming = true;
        this.dirty = true;
    }

    /** Frame a box of world millimetres — one change picked out of a list, usually. */
    frame(bounds: Bounds | null): void {
        this.needsFraming = false;

        if (this.size.width === 0 || this.size.height === 0) {
            return;
        }

        this.viewport =
            bounds === null
                ? centreOn({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { x: 0, y: 0 }, this.size)
                : fitBounds(bounds, this.size, {
                      padding: FRAME_PADDING_PX,
                      currentZoom: this.viewport.zoom,
                  });

        this.dirty = true;
    }

    /** Frame everything the comparison covers, including where a deleted element used to be. */
    frameAll(): void {
        this.frame(this.extent());
    }

    private extent(): Bounds | null {
        const content = this.content;

        if (content === null) {
            return null;
        }

        let bounds = documentBounds(content.drawing);

        if (content.diff === null || content.against === null) {
            return bounds;
        }

        // Something deleted is not in the drawing any more, so framing the drawing alone would
        // leave the one mark somebody opened this to see just off the edge.
        const lookup = makeLookup(content.against.elements);

        for (const change of content.diff.elements) {
            if (change.before !== null) {
                bounds = unionBounds(bounds, elementBounds(change.before, lookup));
            }
        }

        return bounds;
    }

    private buildDrawing(drawing: HashiraDocument): SceneLayer[] {
        return buildScene(drawing.elements, drawing.layers, {
            palette: {
                ink: this.theme.ink,
                subtle: this.theme.inkSubtle,
                roomFill: this.theme.accentSoft,
            },
            unit: drawing.settings.unit,
            joins: wallJoins(drawing.elements),

            // Everything, whatever its layer says: see `redlines.ts`. A comparison that leaves
            // out half of a version is not one, and a mark over geometry nobody can see is
            // worse than both together.
            includeHidden: true,
        });
    }

    private loop = (): void => {
        if (this.needsFraming && this.size.width > 0 && this.size.height > 0) {
            this.frameAll();
        }

        if (this.dirty) {
            this.dirty = false;
            this.paint();
        }

        this.animation = requestAnimationFrame(this.loop);
    };

    private paint(): void {
        const ctx = this.context;

        if (ctx === null) {
            return;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.sheet;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.size.width === 0 || this.size.height === 0) {
            return;
        }

        const factor = this.viewport.zoom * this.dpr;

        ctx.setTransform(
            factor,
            0,
            0,
            factor,
            -this.viewport.x * factor,
            -this.viewport.y * factor,
        );

        const px = 1 / this.viewport.zoom;

        paintScene(ctx, this.drawing, { px });
        paintScene(ctx, this.redlines, { px });
    }

    private screenPoint(event: PointerEvent | WheelEvent): Point {
        const rect = this.canvas.getBoundingClientRect();

        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    private onPointerDown = (event: PointerEvent): void => {
        // Left or middle: there is nothing else either could be doing here.
        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        this.panningFrom = this.screenPoint(event);
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.style.cursor = 'grabbing';
        event.preventDefault();
    };

    private onPointerMove = (event: PointerEvent): void => {
        const from = this.panningFrom;

        if (from === null) {
            return;
        }

        const now = this.screenPoint(event);

        this.viewport = panByScreen(this.viewport, { x: now.x - from.x, y: now.y - from.y });
        this.panningFrom = now;
        this.dirty = true;
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (this.panningFrom === null) {
            return;
        }

        this.panningFrom = null;
        this.canvas.style.cursor = '';

        if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
        }
    };

    private onWheel = (event: WheelEvent): void => {
        event.preventDefault();

        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

        this.viewport = zoomAt(this.viewport, this.screenPoint(event), factor);
        this.dirty = true;
    };
}
