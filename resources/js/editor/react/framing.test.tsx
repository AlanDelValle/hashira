import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { point } from '@/editor/geometry/vec';
import { emptyDocument } from '@/editor/model/document';
import { createWall } from '@/editor/model/factories';
import { useDocumentStore } from '@/editor/store/documentStore';
import { useViewportStore } from '@/editor/store/viewportStore';
import { DEFAULT_ZOOM } from '@/editor/viewport/viewport';

import { useFrameOnce, zoomToDrawing } from './framing';

function Probe({ id, ready = true }: { id: string; ready?: boolean }) {
    useFrameOnce(id, ready);

    return null;
}

function drawingWithAWall() {
    return {
        ...emptyDocument('Ground floor'),
        id: 'doc',
        elements: [createWall(point(0, 0), point(20_000, 0), 'layer_architecture')],
    };
}

describe('framing a drawing once', () => {
    beforeEach(() => {
        useDocumentStore.setState({ document: drawingWithAWall(), dropped: [], error: null });
        useViewportStore.setState({
            viewport: { x: 0, y: 0, zoom: DEFAULT_ZOOM },
            size: { width: 800, height: 600 },
        });
    });

    it('frames the drawing when it and the canvas both exist', () => {
        render(<Probe id="doc" />);

        // A 20 m wall in an 800 px canvas has to zoom out well past the default to fit.
        expect(useViewportStore.getState().viewport.zoom).toBeLessThan(DEFAULT_ZOOM);
    });

    it('does not frame again once it has, so it never fights a pan', () => {
        const { rerender } = render(<Probe id="doc" />);

        useViewportStore.getState().setViewport({ x: 5_000, y: 5_000, zoom: 0.5 });
        rerender(<Probe id="doc" />);

        expect(useViewportStore.getState().viewport).toEqual({ x: 5_000, y: 5_000, zoom: 0.5 });
    });

    it('frames again when a different drawing is opened', () => {
        const { rerender } = render(<Probe id="doc" />);

        useViewportStore.getState().setViewport({ x: 5_000, y: 5_000, zoom: 0.5 });
        rerender(<Probe id="other" />);

        expect(useViewportStore.getState().viewport.zoom).not.toBe(0.5);
    });

    it('waits while the caller says the drawing has not arrived', () => {
        // The share viewer's case: the store still holds whatever was in this tab before.
        render(<Probe id="doc" ready={false} />);

        expect(useViewportStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
    });

    it('waits while the canvas has no size, rather than counting that as framed', () => {
        useViewportStore.setState({ size: { width: 0, height: 0 } });

        const { rerender } = render(<Probe id="doc" />);

        useViewportStore.setState({ size: { width: 800, height: 600 } });
        rerender(<Probe id="doc" />);

        expect(useViewportStore.getState().viewport.zoom).toBeLessThan(DEFAULT_ZOOM);
    });

    it('centres on the origin when there is nothing to frame', () => {
        useDocumentStore.setState({ document: { ...emptyDocument('Empty'), id: 'empty' } });

        render(<Probe id="empty" />);

        const { viewport } = useViewportStore.getState();

        expect(viewport.zoom).toBe(DEFAULT_ZOOM);
        expect(viewport.x).toBe(-400 / DEFAULT_ZOOM);
    });
});

describe('zoomToDrawing', () => {
    it('frames the whole drawing on demand', () => {
        useDocumentStore.setState({ document: drawingWithAWall(), dropped: [], error: null });
        useViewportStore.setState({
            viewport: { x: 0, y: 0, zoom: 2 },
            size: { width: 800, height: 600 },
        });

        zoomToDrawing();

        expect(useViewportStore.getState().viewport.zoom).toBeLessThan(2);
    });

    it('leaves the viewport alone when the drawing is empty', () => {
        useDocumentStore.setState({ document: emptyDocument('Empty') });
        useViewportStore.setState({
            viewport: { x: 10, y: 20, zoom: 0.3 },
            size: { width: 800, height: 600 },
        });

        zoomToDrawing();

        expect(useViewportStore.getState().viewport).toEqual({ x: 10, y: 20, zoom: 0.3 });
    });
});
