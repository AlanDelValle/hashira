import { beforeEach, describe, expect, it } from 'vitest';

import { point, type Point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { makeLookup } from '@/editor/model/elements';
import { DEFAULT_LINE_TYPE } from '@/editor/model/lineTypes';
import { history, useDocumentStore } from '@/editor/store/documentStore';
import { useEditorStore } from '@/editor/store/editorStore';
import { interaction } from '@/editor/store/interaction';

import { createLineTool } from './drawTools';
import type { ToolContext, ToolEvent } from './types';

const LAYER = 'layer_architecture';

function at(world: Point): ToolEvent {
    return {
        world,
        rawWorld: world,
        screen: world,
        shift: false,
        alt: false,
        mod: false,
        button: 0,
    };
}

/** Only the two fields the drag tools actually read. */
const context = {
    activeLayerId: LAYER,
} as unknown as ToolContext;

function drawALine(from: Point, to: Point) {
    const tool = createLineTool();

    tool.onPointerDown?.(at(from), context);
    tool.onPointerMove?.(at(to), context);

    return { tool, preview: interaction.preview[0] };
}

function shapes() {
    return useDocumentStore.getState().document.elements;
}

describe('drawing a shape with the line type the tool is set to', () => {
    beforeEach(() => {
        const document = emptyDocument('Ground floor');

        useDocumentStore.setState({ document, dropped: [], error: null });
        useEditorStore.setState({
            tool: 'line',
            selection: [],
            activeLayerId: LAYER,
            lineType: DEFAULT_LINE_TYPE,
        });
        history.clear();
        makeLookup(document.elements);
    });

    it('writes the chosen type onto the shape it commits', () => {
        useEditorStore.setState({ lineType: 'dash-dot-narrow' });

        const { tool } = drawALine(point(0, 0), point(3000, 0));

        tool.onPointerUp?.(at(point(3000, 0)), context);

        expect(shapes()).toHaveLength(1);
        expect(shapes()[0]?.style?.lineType).toBe('dash-dot-narrow');
    });

    /*
     * The rubber band comes out of the same factory as the committed shape, which is the only
     * way to see before letting go that the right convention is selected.
     */
    it('draws the preview with it too', () => {
        useEditorStore.setState({ lineType: 'dashed-narrow' });

        const { preview } = drawALine(point(0, 0), point(3000, 0));

        expect(preview?.style?.lineType).toBe('dashed-narrow');
    });

    it('leaves the style off entirely while the tool is on the default', () => {
        const { tool, preview } = drawALine(point(0, 0), point(3000, 0));

        tool.onPointerUp?.(at(point(3000, 0)), context);

        expect(preview?.style).toBeUndefined();
        expect(shapes()[0]?.style).toBeUndefined();
    });
});
