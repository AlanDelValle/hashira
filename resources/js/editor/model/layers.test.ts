import { describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';

import { defaultLayers } from './document';
import { createWall } from './factories';
import {
    addLayer,
    elementsOn,
    moveLayer,
    moveToLayer,
    recolourLayer,
    removeLayer,
    renameLayer,
} from './layers';

const ARCHITECTURE = 'layer_architecture';

describe('editing the list of layers', () => {
    it('adds one on top of the rest', () => {
        const layers = defaultLayers();
        const next = addLayer(layers, 'Services');
        const added = next[next.length - 1];

        expect(next).toHaveLength(layers.length + 1);
        expect(added?.name).toBe('Services');
        expect(added?.order).toBeGreaterThan(layers[layers.length - 1]?.order ?? 0);
    });

    it('names an unnamed one after its position rather than leaving it blank', () => {
        const next = addLayer(defaultLayers(), '   ');

        expect(next[next.length - 1]?.name).toBe('Layer 6');
    });

    it('renames one, and refuses to rename it to nothing', () => {
        const layers = defaultLayers();

        expect(renameLayer(layers, ARCHITECTURE, ' Shell ')[0]?.name).toBe('Shell');
        expect(renameLayer(layers, ARCHITECTURE, '  ')[0]?.name).toBe('Architecture');
    });

    it('recolours one', () => {
        expect(recolourLayer(defaultLayers(), ARCHITECTURE, '#a9302a')[0]?.color).toBe('#a9302a');
    });

    it('removes one', () => {
        const next = removeLayer(defaultLayers(), ARCHITECTURE);

        expect(next.map((layer) => layer.id)).not.toContain(ARCHITECTURE);
    });

    /*
     * Every element in the format names the layer it belongs to, so a drawing with no layers
     * has nowhere to put the next thing drawn on it.
     */
    it('will not remove the last one', () => {
        const only = defaultLayers().slice(0, 1);

        expect(removeLayer(only, ARCHITECTURE)).toHaveLength(1);
    });

    it('reorders by swapping the two numbers, not by splicing the list', () => {
        const layers = defaultLayers();
        const next = moveLayer(layers, 0, 1);

        expect(next[0]?.id).toBe(layers[1]?.id);
        expect(next[1]?.id).toBe(layers[0]?.id);
        expect(next.map((layer) => layer.order)).toEqual(layers.map((layer) => layer.order));
    });

    it('leaves the ends alone', () => {
        const layers = defaultLayers();

        expect(moveLayer(layers, 0, -1)).toEqual(layers);
        expect(moveLayer(layers, layers.length - 1, 1)).toEqual(layers);
    });
});

describe('what is standing on a layer', () => {
    const walls = [
        { ...createWall(point(0, 0), point(1000, 0), ARCHITECTURE), id: 'a' },
        { ...createWall(point(0, 0), point(1000, 0), 'layer_furniture'), id: 'b' },
    ];

    it('is only what names it', () => {
        expect(elementsOn(walls, ARCHITECTURE).map((element) => element.id)).toEqual(['a']);
    });

    it('moves somewhere else without changing anything but the layer', () => {
        const moved = moveToLayer(elementsOn(walls, ARCHITECTURE), 'layer_furniture');

        expect(moved[0]?.layerId).toBe('layer_furniture');
        expect(moved[0]?.geometry).toEqual(walls[0]?.geometry);
    });
});
