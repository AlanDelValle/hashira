import { localToWorld } from '@/editor/model/elements';
import type { Element, UnderlayElement } from '@/editor/model/types';

import { requestRepaint } from './frame';

/**
 * Pages to trace over.
 *
 * An underlay is the one thing on the sheet that is not part of the drawing, and it is
 * handled apart from everything else because of it. It is not in the scene, so no exporter
 * can put somebody else's survey into a plan by accident; it is painted straight onto the
 * canvas underneath the drawing, at whatever opacity it was placed with.
 *
 * The picture itself is fetched once and kept. A drawing is repainted at pointer rate and an
 * `Image` that reloaded per frame would be a request per frame; one that is still loading
 * simply is not painted yet, and asks for a repaint when it arrives.
 */

interface Page {
    url: string;
    image: HTMLImageElement | null;
    failed: boolean;
}

const pages = new Map<string, Page>();

/** Tell the renderer where each page's picture lives. Registering the same id again is fine. */
export function registerUnderlays(entries: readonly { id: string; url: string }[]): void {
    let changed = false;

    for (const entry of entries) {
        const existing = pages.get(entry.id);

        if (existing?.url === entry.url) continue;

        pages.set(entry.id, { url: entry.url, image: null, failed: false });
        changed = true;
    }

    if (changed) requestRepaint();
}

export function forgetUnderlay(id: string): void {
    pages.delete(id);
    requestRepaint();
}

/** The picture for a page, once it has arrived. Starts loading it the first time it is asked. */
function pictureFor(id: string): HTMLImageElement | null {
    const page = pages.get(id);

    if (page === undefined || page.failed) {
        return null;
    }

    if (page.image !== null) {
        return page.image.complete && page.image.naturalWidth > 0 ? page.image : null;
    }

    const image = new Image();

    page.image = image;
    image.onload = () => requestRepaint();
    image.onerror = () => {
        page.failed = true;
    };
    image.src = page.url;

    return null;
}

export function isUnderlay(element: Element): element is UnderlayElement {
    return element.type === 'underlay';
}

/**
 * Paint every underlay, in world space, on a context that is already transformed.
 *
 * `px` is one screen pixel in world millimetres — the same value every other painter takes —
 * and is used only to dash the outline of a page whose picture has not arrived, so that an
 * underlay which is still loading or has gone missing is visible rather than absent.
 */
export function paintUnderlays(
    ctx: CanvasRenderingContext2D,
    elements: readonly Element[],
    px: number,
    outline: string,
): void {
    for (const element of elements) {
        if (!isUnderlay(element)) continue;

        const { width, height, opacity, underlayId } = element.geometry;

        // Nothing is known about this page at all — which is what a share link sees, since the
        // pages a drawing was traced from are not part of what a link hands out. Drawing a
        // dashed box there would advertise a document the reader is not being given.
        if (!pages.has(underlayId)) continue;

        const picture = pictureFor(underlayId);

        ctx.save();

        const origin = localToWorld(element.transform, { x: 0, y: 0 });

        ctx.translate(origin.x, origin.y);
        ctx.rotate(element.transform.rotation);

        if (picture === null) {
            // Still on its way, or it never arrived. A dashed box says where the page will be,
            // which is more honest than a gap the size of a survey.
            ctx.strokeStyle = outline;
            ctx.lineWidth = px;
            ctx.setLineDash([6 * px, 4 * px]);
            ctx.strokeRect(-width / 2, -height / 2, width, height);
        } else {
            ctx.globalAlpha = opacity;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(picture, -width / 2, -height / 2, width, height);
        }

        ctx.restore();
    }
}
