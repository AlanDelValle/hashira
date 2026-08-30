import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The contrast audit.
 *
 * The palette is deliberately quiet, and a quiet palette is exactly the kind that drifts a
 * shade too light without anyone noticing. This reads the tokens out of the stylesheet — the
 * one place they are defined — and holds every combination the interface actually paints to
 * WCAG 2.1 AA: 4.5:1 for text, 3:1 for large text and for the edges of controls.
 *
 * Pairs are listed by hand rather than generated, because the question is not "does every
 * colour work on every background" but "does the combination we ship work".
 */

const AA_TEXT = 4.5;
const AA_LARGE_OR_UI = 3;

const tokens = readTokens();

interface Pair {
    fg: string;
    bg: string;
    /** Where this combination appears, so a failure names the screen to go and look at. */
    where: string;
    minimum?: number;
}

const TEXT_PAIRS: Pair[] = [
    { fg: 'ink', bg: 'canvas', where: 'headings on the dashboard and landing page' },
    { fg: 'ink', bg: 'surface', where: 'panel and dialog copy' },
    { fg: 'ink', bg: 'sunken', where: 'hovered menu items and toolbar buttons' },
    { fg: 'ink-muted', bg: 'canvas', where: 'body copy on the landing page' },
    { fg: 'ink-muted', bg: 'surface', where: 'property labels, menu items, header buttons' },
    { fg: 'ink-muted', bg: 'sunken', where: 'keys in the shortcut reference' },
    { fg: 'ink-subtle', bg: 'canvas', where: 'the loading label and landing footnotes' },
    { fg: 'ink-subtle', bg: 'surface', where: 'the status bar, section headings, field hints' },
    { fg: 'ink-subtle', bg: 'accent-soft', where: 'a hidden layer on the active layer row' },
    { fg: 'accent', bg: 'surface', where: 'the active tool and the active layer' },
    { fg: 'accent', bg: 'accent-soft', where: 'the active tool button' },
    { fg: 'accent-strong', bg: 'accent-soft', where: 'selected text' },
    { fg: 'danger', bg: 'surface', where: 'save failures and the delete menu item' },
    { fg: 'danger', bg: 'danger-soft', where: 'the highlighted delete menu item' },
    { fg: 'positive', bg: 'surface', where: 'confirmation copy' },
    { fg: 'ink-inverse', bg: 'ink', where: 'the primary button' },
    { fg: 'ink-inverse', bg: 'danger', where: 'the destructive button' },
];

/** Boundaries that carry meaning: the edge of a field, of a button, of the focus ring. */
const UI_PAIRS: Pair[] = [
    { fg: 'line-strong', bg: 'surface', where: 'the edge of a text field or secondary button' },
    { fg: 'line-strong', bg: 'canvas', where: 'the secondary button on the landing page' },
    { fg: 'line-strong', bg: 'sunken', where: 'a hovered secondary button, keys in the reference' },
    { fg: 'accent', bg: 'surface', where: 'the focus ring' },
    { fg: 'accent', bg: 'canvas', where: 'the focus ring on a page background' },
];

describe('colour contrast', () => {
    it.each(TEXT_PAIRS)('$fg on $bg carries text — $where', ({ fg, bg }) => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it.each(UI_PAIRS)('$fg on $bg identifies a control — $where', ({ fg, bg }) => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
    });

    it('keeps the three ink steps far enough apart to read as a hierarchy', () => {
        // Without this, fixing contrast by darkening everything collapses the palette into
        // one grey and the audit still passes.
        expect(contrast(token('ink-subtle'), token('ink-muted'))).toBeGreaterThan(1.25);
        expect(contrast(token('ink-muted'), token('ink'))).toBeGreaterThan(1.25);
    });
});

function token(name: string): string {
    const value = tokens.get(`--color-${name}`);

    if (value === undefined) {
        throw new Error(`No --color-${name} in resources/css/app.css.`);
    }

    return value;
}

function readTokens(): Map<string, string> {
    // Resolved from the project root rather than from this module: the tests run under jsdom,
    // where `import.meta.url` is not a file URL.
    const css = readFileSync(join(process.cwd(), 'resources/css/app.css'), 'utf8');
    const found = new Map<string, string>();

    for (const [, name, value] of css.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
        if (name !== undefined && value !== undefined) {
            found.set(name, value);
        }
    }

    return found;
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
    const channels = [1, 3, 5]
        .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
    const first = luminance(a);
    const second = luminance(b);

    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
