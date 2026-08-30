import { useEffect, useId, useRef } from 'react';

import { InputController } from '@/editor/input/controller';
import { CanvasRenderer } from '@/editor/render/renderer';

/**
 * The one React component that touches the canvas, and it does so exactly twice: once to
 * start the renderer and the input controller, once to stop them. Everything that happens on
 * the drawing surface between those two moments happens without React.
 */
export function CanvasHost({ readOnly = false }: { readOnly?: boolean } = {}) {
    const describedBy = useId();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const canvas = canvasRef.current;

        if (wrapper === null || canvas === null) {
            return;
        }

        const renderer = new CanvasRenderer(canvas);
        const input = new InputController(canvas, { readOnly });

        renderer.start();
        input.attach();

        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;

            if (rect !== undefined) {
                renderer.resize(rect.width, rect.height);
            }
        });

        observer.observe(wrapper);

        return () => {
            observer.disconnect();
            input.detach();
            renderer.stop();
        };
    }, [readOnly]);

    return (
        <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
            <canvas
                ref={canvasRef}
                /*
                 * Focusable, because this is where the keyboard has to land for a shortcut to
                 * reach a tool. A pointer click never shows the ring — the selection already
                 * says what is happening — but arriving here by Tab does, because otherwise
                 * the focus simply disappears for one stop.
                 */
                tabIndex={0}
                aria-label={readOnly ? 'Drawing' : 'Drawing surface'}
                aria-describedby={describedBy}
                className="focus-visible:outline-accent block touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
            />

            <p id={describedBy} className="sr-only">
                {readOnly
                    ? 'Drag to pan and scroll to zoom. Press Shift and 1 to fit the whole drawing.'
                    : 'A pointer-driven drawing surface. Choose a tool from the rail on the left, then click on the sheet to draw. Press the question mark key for the full list of shortcuts.'}
            </p>
        </div>
    );
}
