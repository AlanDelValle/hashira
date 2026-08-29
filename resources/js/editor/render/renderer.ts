import { boundsIntersect } from '@/editor/geometry/bbox';
import { elementBounds, makeLookup } from '@/editor/model/elements';
import { formatLength } from '@/editor/model/units';
import type { Element, HashiraDocument, HostedElement } from '@/editor/model/types';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';
import { useViewportStore } from '@/editor/store/viewportStore';
import { visibleBounds } from '@/editor/viewport/viewport';

import { setInvalidator } from './frame';
import { paintGrid } from './grid';
import {
    paintHover,
    paintMarquee,
    paintPreview,
    paintSelection,
    paintSnapIndicator,
} from './overlay';
import { paintElement, type PaintContext } from './painters';
import { writeReadout } from './readout';
import { readTheme, type CanvasTheme } from './theme';

/**
 * The drawing surface.
 *
 * One canvas, one animation frame loop, and a single rule: this class reads state, it never
 * owns it. It pulls from the stores imperatively and repaints only when something has marked
 * itself dirty, so an idle editor costs nothing and a drag costs one frame per frame — with
 * no React render anywhere in that path.
 */
export class CanvasRenderer {
    private readonly canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D | null;
    private theme: CanvasTheme;
    private frame = 0;
    private dirty = true;
    private dpr = 1;
    private unsubscribes: (() => void)[] = [];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.theme = readTheme(window.document.documentElement);
    }

    start(): void {
        setInvalidator(() => this.invalidate());

        this.unsubscribes = [
            useDocumentStore.subscribe(() => this.invalidate()),
            useEditorStore.subscribe(() => this.invalidate()),
            useViewportStore.subscribe(() => this.invalidate()),
        ];

        this.loop();
    }

    stop(): void {
        cancelAnimationFrame(this.frame);
        setInvalidator(null);

        for (const unsubscribe of this.unsubscribes) {
            unsubscribe();
        }

        this.unsubscribes = [];
    }

    invalidate(): void {
        this.dirty = true;
    }

    /** Size the backing store to the device's pixels so hairlines stay hairlines. */
    resize(width: number, height: number): void {
        this.dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

        this.canvas.width = Math.max(1, Math.round(width * this.dpr));
        this.canvas.height = Math.max(1, Math.round(height * this.dpr));
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        this.theme = readTheme(window.document.documentElement);
        useViewportStore.getState().setSize({ width, height });
        this.invalidate();
    }

    private loop = (): void => {
        if (this.dirty) {
            this.dirty = false;
            this.paint();
        }

        this.frame = requestAnimationFrame(this.loop);
    };

    private paint(): void {
        const ctx = this.context;

        if (ctx === null) {
            return;
        }

        const { viewport, size } = useViewportStore.getState();
        const { document: drawing } = useDocumentStore.getState();
        const { selection, gridVisible } = useEditorStore.getState();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.sheet;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (size.width === 0 || size.height === 0) {
            return;
        }

        // From here on the canvas is in world space: coordinates are millimetres, and the
        // only thing that has to be scaled back is anything measured in screen pixels.
        const factor = viewport.zoom * this.dpr;
        ctx.setTransform(factor, 0, 0, factor, -viewport.x * factor, -viewport.y * factor);

        const visible = visibleBounds(viewport, size);
        const px = 1 / viewport.zoom;

        if (gridVisible && drawing.settings.grid.visible) {
            paintGrid(ctx, viewport, visible, drawing.settings.grid, this.theme);
        }

        const pc: PaintContext = {
            ctx,
            theme: this.theme,
            lookup: makeLookup(drawing),
            openings: groupOpenings(drawing),
            px,
            layerColor: layerColors(drawing, this.theme.ink),
        };

        const dragged = new Map(
            (interaction.drag?.preview ?? []).map((element) => [element.id, element]),
        );

        const hiddenLayers = new Set(
            drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
        );

        const paintable: Element[] = [];

        for (const element of orderByLayer(drawing)) {
            if (hiddenLayers.has(element.layerId)) continue;

            const current = dragged.get(element.id) ?? element;
            const bounds = elementBounds(current, pc.lookup);

            // Off-screen elements cost nothing but a bounds check.
            if (bounds !== null && !boundsIntersect(bounds, visible)) continue;

            paintable.push(current);
        }

        for (const element of paintable) {
            paintElement(pc, element);
        }

        const selected = new Set(selection);
        const hovered = interaction.hoveredId;

        if (hovered !== null && !selected.has(hovered)) {
            const element = dragged.get(hovered) ?? pc.lookup(hovered);

            if (element !== undefined && !hiddenLayers.has(element.layerId)) {
                paintHover(pc, element);
            }
        }

        paintSelection(
            pc,
            selection.flatMap((id) => {
                const element = dragged.get(id) ?? pc.lookup(id);

                return element === undefined ? [] : [element];
            }),
        );

        if (interaction.marquee !== null) {
            paintMarquee(pc, interaction.marquee);
        }

        if (interaction.preview !== null) {
            paintPreview(pc, interaction.preview, interaction.draftPoints);
        }

        if (interaction.snap !== null) {
            paintSnapIndicator(pc, interaction.snap);
        }

        this.writeReadouts(drawing, viewport.zoom);
    }

    private writeReadouts(drawing: HashiraDocument, zoom: number): void {
        const pointer = interaction.pointerWorld;
        const unit = drawing.settings.unit;

        writeReadout(
            'cursor',
            pointer === null
                ? '—'
                : `X ${formatLength(pointer.x, unit)}   Y ${formatLength(pointer.y, unit)}`,
        );

        writeReadout('zoom', `${Math.round(zoom * 1000) / 10}%`);
    }
}

/** Elements in paint order: by layer order first, then by their position in the document. */
function orderByLayer(drawing: HashiraDocument): Element[] {
    const rank = new Map(drawing.layers.map((layer, index) => [layer.id, index]));
    const fallback = drawing.layers.length;

    return [...drawing.elements].sort(
        (a, b) => (rank.get(a.layerId) ?? fallback) - (rank.get(b.layerId) ?? fallback),
    );
}

function groupOpenings(drawing: HashiraDocument): Map<string, HostedElement[]> {
    const grouped = new Map<string, HostedElement[]>();

    for (const element of drawing.elements) {
        if (element.type !== 'door' && element.type !== 'window') continue;

        const existing = grouped.get(element.geometry.hostId);

        if (existing === undefined) {
            grouped.set(element.geometry.hostId, [element]);
        } else {
            existing.push(element);
        }
    }

    return grouped;
}

function layerColors(drawing: HashiraDocument, fallback: string): (layerId: string) => string {
    const colors = new Map(drawing.layers.map((layer) => [layer.id, layer.color]));

    return (layerId) => colors.get(layerId) ?? fallback;
}
