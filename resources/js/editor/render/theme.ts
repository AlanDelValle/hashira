/**
 * Canvas colours, read from the same CSS custom properties the interface uses.
 *
 * The alternative — a second palette hard-coded for the canvas — guarantees that the drawing
 * surface and the panels around it drift apart. Reading the tokens keeps one source of truth
 * and means a future theme switch reaches the drawing too.
 */
export interface CanvasTheme {
    sheet: string;
    gridMinor: string;
    gridMajor: string;
    ink: string;
    inkMuted: string;
    inkSubtle: string;
    line: string;
    accent: string;
    accentSoft: string;
}

const FALLBACK: CanvasTheme = {
    sheet: '#ffffff',
    gridMinor: '#e9e7e2',
    gridMajor: '#d8d5ce',
    ink: '#17191d',
    inkMuted: '#4d5158',
    inkSubtle: '#686c74',
    line: '#e5e3de',
    accent: '#2c58c4',
    accentSoft: '#ecf1fc',
};

const TOKENS: Record<keyof CanvasTheme, string> = {
    sheet: '--color-sheet',
    gridMinor: '--color-grid-minor',
    gridMajor: '--color-grid-major',
    ink: '--color-ink',
    inkMuted: '--color-ink-muted',
    inkSubtle: '--color-ink-subtle',
    line: '--color-line',
    accent: '--color-accent',
    accentSoft: '--color-accent-soft',
};

export function readTheme(root: Element): CanvasTheme {
    const styles = getComputedStyle(root);
    const theme = { ...FALLBACK };

    for (const [key, token] of Object.entries(TOKENS) as [keyof CanvasTheme, string][]) {
        const value = styles.getPropertyValue(token).trim();

        if (value !== '') {
            theme[key] = value;
        }
    }

    return theme;
}
