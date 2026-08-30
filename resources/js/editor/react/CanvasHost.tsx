import { useEffect, useRef } from 'react';

import { InputController } from '@/editor/input/controller';
import { CanvasRenderer } from '@/editor/render/renderer';

/**
 * The one React component that touches the canvas, and it does so exactly twice: once to
 * start the renderer and the input controller, once to stop them. Everything that happens on
 * the drawing surface between those two moments happens without React.
 */
export function CanvasHost({ readOnly = false }: { readOnly?: boolean } = {}) {
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
                // Focusable so the canvas can take keyboard input directly; the outline is
                // suppressed because the drawing shows focus through the selection itself.
                tabIndex={0}
                aria-label="Drawing surface"
                className="block touch-none outline-none"
            />
        </div>
    );
}
