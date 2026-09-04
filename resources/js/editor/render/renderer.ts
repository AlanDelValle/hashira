import { sheetAside, type LegendEntry } from '@/editor/export/sheet';
import { conventionsUsed } from '@/editor/model/conventions';
import { documentIndex } from '@/editor/model/documentIndex';
import { resolveSheet } from '@/editor/model/sheets';
import { boundsFromPoints, boundsHeight, boundsWidth } from '@/editor/geometry/bbox';
import { documentWallJoins, wallJoins } from '@/editor/model/walls';
import { segmentAngle } from '@/editor/model/edits';
import {
    drawnLayers,
    elementLength,
    wallSegment,
    type ElementLookup,
} from '@/editor/model/elements';
import type { DisplayUnit, Element, HashiraDocument, WallElement } from '@/editor/model/types';
import { formatAngle, formatArea, formatLength } from '@/editor/model/units';
import { buildScene } from '@/editor/scene/build';
import type { ScenePalette } from '@/editor/scene/types';
import { commentPins, useCommentsStore } from '@/editor/store/commentsStore';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';
import { useViewportStore } from '@/editor/store/viewportStore';
import { visibleBounds } from '@/editor/viewport/viewport';

import { paintScene } from './canvasScene';
import { paintCommentPins } from './comments';
import { setInvalidator } from './frame';
import { paintGrid } from './grid';
import {
    paintHover,
    paintMarquee,
    paintPreview,
    paintSelection,
    paintSnapIndicator,
    type OverlayContext,
} from './overlay';
import { writeReadout } from './readout';
import { paintSheetFrame } from './sheetFrame';

/**
 * Whether this sheet has a strip beside the drawing, decided exactly as the print decides it.
 *
 * The canvas draws the outline and never the contents, so all it needs is the answer — but it
 * has to be the same answer, or the outline reserves a margin the print then fills with
 * drawing. It asks with what the print would be given: the layers a legend would list, and the
 * conventions a key would explain.
 */
function hasAside(drawing: HashiraDocument): boolean {
    const layers = drawnLayers(drawing);
    const legend: LegendEntry[] = layers.map((layer) => ({ name: layer.name, color: layer.color }));
    const key = conventionsUsed(drawing.elements, new Set(layers.map((layer) => layer.id)));

    return sheetAside(drawing.settings.notes, legend, key) !== null;
}
import { paintUnderlays } from './underlay';
import { readTheme, type CanvasTheme } from './theme';

/**
 * The drawing surface.
 *
 * One canvas, one animation frame loop, and a single rule: this class reads state, it never
 * owns it. It pulls from the stores imperatively and repaints only when something has marked
 * itself dirty, so an idle editor costs nothing and a drag costs one frame per frame — with
 * no React render anywhere in that path.
 *
 * What it paints comes from the same scene builder the exporters use, so the screen and a PDF
 * cannot disagree about what a wall with a door in it looks like.
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
            // A thread arriving, being resolved or being opened in the panel all change what
            // the drawing shows, and none of them touch the document.
            useCommentsStore.subscribe(() => this.invalidate()),
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
        const { selection, gridVisible, tool, sheetFrameVisible, activeSheetId } =
            useEditorStore.getState();

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
        const palette = this.palette();

        // What a hidden layer hides: the underlays beneath the drawing, and the walls that
        // would otherwise still be cutting mitres into the ones on show.
        const hidden = new Set(
            drawing.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
        );

        const shown = drawing.elements.filter((element) => !hidden.has(element.layerId));

        // Underneath everything, including the grid: a page being traced is the paper the
        // drawing sits on, and it is deliberately not part of the scene the exporters read.
        paintUnderlays(ctx, shown, px, this.theme.inkSubtle);

        if (gridVisible && drawing.settings.grid.visible) {
            paintGrid(ctx, viewport, visible, drawing.settings.grid, this.theme);
        }

        /*
         * What to paint: whatever the index says is on screen. The index belongs to this
         * version of the document, so a pan or a zoom costs a cell walk rather than a pass
         * over every element in the drawing.
         *
         * Elements being dragged are painted in their previewed state — the document itself
         * is untouched until the drag commits — and they are painted wherever they now are,
         * including when they have been dragged in from off screen.
         */
        const index = documentIndex(drawing);
        const preview = interaction.drag?.preview ?? [];
        const dragged = new Map(preview.map((element) => [element.id, element]));

        let onScreen: readonly Element[];
        let lookup: ElementLookup;

        if (preview.length === 0) {
            onScreen = index.near(visible);
            lookup = index.lookup;
        } else {
            const near = new Set(index.near(visible).map((element) => element.id));

            lookup = (id) => dragged.get(id) ?? index.lookup(id);
            onScreen = drawing.elements
                .filter((element) => near.has(element.id) || dragged.has(element.id))
                .map((element) => dragged.get(element.id) ?? element);
        }

        /*
         * Where the walls meet, once for the frame.
         *
         * The drawing, the hover and the selection are three separate scenes, and all three
         * need the same answer. For a drawing nobody is dragging it is the document's own,
         * cached against that version of it, so panning across a large plan costs nothing;
         * while something is being dragged the previewed positions are what the mitres have
         * to follow, so they are worked out again each frame.
         */
        const joins =
            preview.length === 0
                ? documentWallJoins(drawing)
                : wallJoins(shown.map((element) => dragged.get(element.id) ?? element));

        paintScene(
            ctx,
            buildScene(onScreen, drawing.layers, {
                palette,
                unit: drawing.settings.unit,
                joins,
                scale: drawing.settings.scale,
                // Two pixels' worth of world, so a hatch too fine to resolve is not drawn at
                // all: below that it is a grey rectangle that says nothing and costs a frame.
                minimumHatchSpacing: 2 / viewport.zoom,
            }),
            { px },
        );

        // On top of the drawing, because a page outline is a statement about the drawing
        // rather than a part of it — and underneath it, the outline is the first thing a
        // wall's poché covers up.
        if (sheetFrameVisible) {
            const sheet = resolveSheet(drawing.settings.sheets, activeSheetId);

            if (sheet !== undefined) {
                paintSheetFrame(ctx, sheet, index.extent(), this.theme, px, hasAside(drawing));
            }
        }

        const overlay: OverlayContext = {
            ctx,
            theme: this.theme,
            palette,
            layers: drawing.layers,
            lookup,
            joins,
            unit: drawing.settings.unit,
            px,
        };

        const selected = new Set(selection);
        const hovered = interaction.hoveredId;

        if (hovered !== null && !selected.has(hovered)) {
            const element = lookup(hovered);

            if (element !== undefined) {
                paintHover(overlay, element);
            }
        }

        paintSelection(
            overlay,
            selection.flatMap((id): Element[] => {
                const element = lookup(id);

                return element === undefined ? [] : [element];
            }),
        );

        if (interaction.marquee !== null) {
            paintMarquee(overlay, interaction.marquee);
        }

        for (const element of interaction.preview) {
            paintPreview(overlay, element, interaction.draftPoints);
        }

        // The grid catches every pointer move, so its marker is drawn only while a tool is
        // placing points: that is when "your click lands here, not under your cursor" is
        // something the person needs, and the rest of the time it would just be always on.
        if (interaction.snap !== null && (interaction.snap.kind !== 'grid' || tool !== 'select')) {
            paintSnapIndicator(overlay, interaction.snap);
        }

        /*
         * Last, over everything, because a pin is chrome rather than ink: it is not in the
         * scene the exporters read and it never reaches a printed sheet. A plan that goes to
         * site carries what was decided, not the conversation that decided it.
         */
        const { threads, selectedId } = useCommentsStore.getState();

        /*
         * An open remark is something the drawing still owes somebody an answer to, so its pin
         * is on whatever tool is in hand. A resolved one is history, and history belongs in the
         * panel: kept on the sheet it would slowly fill a drawing with rings from conversations
         * that ended months ago. So it comes back only while the comment tool is active, which
         * is when somebody is asking what has already been said.
         */
        const pins = commentPins(threads).filter((pin) => !pin.resolved || tool === 'comment');

        if (pins.length > 0) {
            paintCommentPins({ ctx, theme: this.theme, px }, pins, selectedId);
        }

        this.writeReadouts(drawing, viewport.zoom);
    }

    private palette(): ScenePalette {
        return {
            ink: this.theme.ink,
            subtle: this.theme.inkSubtle,
            roomFill: this.theme.accentSoft,
            sheet: this.theme.sheet,
        };
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
        writeReadout('draft', draftReadout(interaction.preview, unit));
    }
}

/**
 * How long the thing being drawn is, while it is still being drawn.
 *
 * A wall is committed the moment its second corner is clicked, so "draw it, then read its
 * length in the properties panel, then correct it" is three steps to place one wall — and the
 * correction is a different edit from the one that would have been right in the first place.
 * The number that decides where the click goes has to be on screen before the click.
 *
 * It reads off `interaction.preview` — the element the tool would commit if the pointer stopped
 * here — so it cannot disagree with what lands in the drawing, and it is blank for the tools
 * whose preview has no length to state.
 */
function draftReadout(preview: readonly Element[], unit: DisplayUnit): string {
    const [only] = preview;

    if (only === undefined) {
        return '';
    }

    if (preview.length > 1) {
        return enclosureReadout(preview, unit);
    }

    const length = elementLength(only);

    if (length === null) {
        return '';
    }

    const angle = segmentAngle(only);

    // The same two numbers the properties panel names, in the same units and to the same
    // precision, because they are about to describe the same wall.
    return angle === null
        ? formatLength(length, unit)
        : `${formatLength(length, unit)}   ${formatAngle(angle, 1)}`;
}

/**
 * What a run of walls being drawn closes in.
 *
 * A tool that places several elements at once is placing a space, not a shape, and the numbers
 * that decide the click are the ones for the space: how wide and deep it is, and its area. So
 * the walls' centrelines are measured and pulled in by a thickness, which is the inside of the
 * run — the same face `wallSides` reports and the same one the target area was asked about.
 *
 * Measured off the elements the tool is about to commit, like every other draft readout, so it
 * cannot state a room the drawing is not about to get.
 */
function enclosureReadout(preview: readonly Element[], unit: DisplayUnit): string {
    const walls = preview.filter((element): element is WallElement => element.type === 'wall');
    const first = walls[0];

    if (first === undefined) {
        return '';
    }

    const bounds = boundsFromPoints(
        walls.flatMap((wall) => {
            const { a, b } = wallSegment(wall);

            return [a, b];
        }),
    );

    if (bounds === null) {
        return '';
    }

    const width = boundsWidth(bounds) - first.geometry.thickness;
    const height = boundsHeight(bounds) - first.geometry.thickness;

    if (width <= 0 || height <= 0) {
        return '';
    }

    return `${formatLength(width, unit)} × ${formatLength(height, unit)}   ${formatArea(
        width * height,
        unit,
    )}`;
}
