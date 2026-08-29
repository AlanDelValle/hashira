/**
 * The status bar's live numbers are written straight into the DOM by the render loop.
 *
 * Routing cursor coordinates through React state would re-render the chrome on every pointer
 * move — the exact thing the editor's state split exists to prevent. One text node, updated
 * only when the text actually changes, costs nothing.
 */
const nodes = new Map<string, HTMLElement | null>();

export function bindReadout(name: string, node: HTMLElement | null): void {
    nodes.set(name, node);
}

export function writeReadout(name: string, text: string): void {
    const node = nodes.get(name) ?? null;

    if (node !== null && node.textContent !== text) {
        node.textContent = text;
    }
}
