import { expandBounds, boundsHeight, boundsWidth, type Bounds } from '@/editor/geometry/bbox';
import { toDegrees } from '@/editor/geometry/angle';
import type { SceneLayer, ScenePrimitive, Stroke } from '@/editor/scene/types';

import { round, toPathData } from './path';

/**
 * SVG export.
 *
 * The file is written in world millimetres, with `width` and `height` set to the drawing
 * divided by its scale. Opened anywhere, it is the right size on the page: a 1:50 drawing
 * really is a fiftieth of the building. Layers survive as groups, so the file is still
 * organised when it lands in another tool.
 */

export interface SvgOptions {
    bounds: Bounds;
    /** The denominator of the drawing scale: 50 means 1:50. */
    scale: number;
    /** White paper behind the drawing, rather than whatever the viewer's page is. */
    background?: string;
    marginMm?: number;
    title?: string;
}

/** Margin around the drawing, in millimetres on the finished sheet. */
const DEFAULT_MARGIN_MM = 10;

export function sceneToSvg(layers: readonly SceneLayer[], options: SvgOptions): string {
    const margin = (options.marginMm ?? DEFAULT_MARGIN_MM) * options.scale;
    const box = expandBounds(options.bounds, margin);

    const worldWidth = boundsWidth(box);
    const worldHeight = boundsHeight(box);

    const body = layers
        .map(
            (layer) =>
                `  <g id="${escapeAttribute(layer.id)}" data-layer="${escapeAttribute(layer.name)}">\n` +
                layer.primitives
                    .map((primitive) => `    ${element(primitive, options.scale)}`)
                    .filter((line) => line.trim() !== '')
                    .join('\n') +
                `\n  </g>`,
        )
        .join('\n');

    const background =
        options.background === undefined
            ? ''
            : `  <rect x="${round(box.minX)}" y="${round(box.minY)}" width="${round(worldWidth)}" height="${round(worldHeight)}" fill="${options.background}"/>\n`;

    const title =
        options.title === undefined ? '' : `  <title>${escapeText(options.title)}</title>\n`;

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`,
        `     width="${round(worldWidth / options.scale)}mm" height="${round(worldHeight / options.scale)}mm"`,
        `     viewBox="${round(box.minX)} ${round(box.minY)} ${round(worldWidth)} ${round(worldHeight)}">`,
        title + background + body,
        '</svg>',
        '',
    ].join('\n');
}

function element(primitive: ScenePrimitive, scale: number): string {
    const paint = paintAttributes(primitive, scale);

    switch (primitive.kind) {
        case 'polyline':
        case 'arc': {
            const data = toPathData(primitive);

            return data === null ? '' : `<path d="${data}"${paint}/>`;
        }

        case 'circle':
            return `<circle cx="${round(primitive.centre.x)}" cy="${round(primitive.centre.y)}" r="${round(primitive.radius)}"${paint}/>`;

        case 'ellipse': {
            const spin =
                primitive.rotation === 0
                    ? ''
                    : ` transform="rotate(${round(toDegrees(primitive.rotation))} ${round(primitive.centre.x)} ${round(primitive.centre.y)})"`;

            return (
                `<ellipse cx="${round(primitive.centre.x)}" cy="${round(primitive.centre.y)}"` +
                ` rx="${round(primitive.rx)}" ry="${round(primitive.ry)}"${spin}${paint}/>`
            );
        }

        case 'text': {
            const anchor =
                primitive.align === 'center'
                    ? 'middle'
                    : primitive.align === 'right'
                      ? 'end'
                      : 'start';

            const transform =
                primitive.rotation === 0
                    ? ''
                    : ` transform="rotate(${round(toDegrees(primitive.rotation))} ${round(primitive.at.x)} ${round(primitive.at.y)})"`;

            return (
                `<text x="${round(primitive.at.x)}" y="${round(primitive.at.y)}"` +
                ` font-size="${round(primitive.size)}" font-family="sans-serif"` +
                ` text-anchor="${anchor}" fill="${primitive.fill}"${transform}>` +
                `${escapeText(primitive.content)}</text>`
            );
        }
    }
}

function paintAttributes(primitive: ScenePrimitive, scale: number): string {
    if (primitive.kind === 'text') {
        return '';
    }

    const stroke = 'stroke' in primitive ? primitive.stroke : null;
    const fill = 'fill' in primitive ? (primitive.fill ?? null) : null;

    const parts = [` fill="${fill ?? 'none'}"`];

    if (stroke !== null) {
        parts.push(` stroke="${stroke.color}"`);
        parts.push(` stroke-width="${round(strokeWidthInWorld(stroke, scale))}"`);
        parts.push(` stroke-linecap="${stroke.cap ?? 'round'}"`);
        parts.push(' stroke-linejoin="round"');

        const dash = stroke.dash ?? null;

        if (dash !== null && dash.length > 0) {
            parts.push(` stroke-dasharray="${dash.map((mm) => round(mm * scale)).join(' ')}"`);
        }
    }

    return parts.join('');
}

/**
 * A pen weight is a width on the finished sheet, so at 1:50 a 0.25 mm pen is 12.5 world
 * millimetres wide in a file whose user units are world millimetres. A world width is a real
 * dimension and passes through untouched.
 */
export function strokeWidthInWorld(stroke: Stroke, scale: number): number {
    return stroke.width.kind === 'world' ? stroke.width.mm : stroke.width.mm * scale;
}

function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;');
}
