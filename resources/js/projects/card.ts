import type { DrawingSummary, ProjectSummary } from '@/types/api';

/**
 * What a project's row says about itself, beyond its name.
 *
 * Two lists rather than one sentence, because they answer different questions and are set in
 * different faces. The first is the drawing — page, scale, how much is on it — and is read in
 * the same vocabulary and the same monospaced figures the status bar and the sheets panel
 * already use, so that a card and the editor it opens are recognisably one product. The second
 * is everything about access: whose it is, what you hold, who else can reach it.
 *
 * Anything unknown is left out rather than written as a zero or a dash. A drawing the server
 * could not count is a card that says less, never a card that says nothing.
 */

/** "14 elements", "1 element" — and nothing at all when the count is unknown. */
function count(value: number | null, noun: string): string | null {
    if (value === null) return null;

    return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/**
 * "A3 · 1:50 · 14 elements · 5 layers".
 *
 * A scale is written the way it is plotted, and a whole number is written without a decimal
 * point: 1:50, never 1:50.0. A sheet count is only worth saying when there is more than one,
 * since every drawing has at least a page to print on and "1 sheet" tells nobody anything.
 */
export function describeDrawing(drawing: DrawingSummary | null | undefined): string | null {
    if (drawing === null || drawing === undefined) return null;

    const parts: (string | null)[] = [
        drawing.sheet,
        drawing.scale === null ? null : `1:${formatScale(drawing.scale)}`,
    ];

    /*
     * A project one minute old has five layers and a page and nothing drawn on it. Reporting
     * "0 elements · 5 layers" is true and reads as a fault; what somebody wants to know about
     * that card is that the drawing is still empty, which is one thing rather than three.
     */
    if (drawing.elements === 0) {
        parts.push('nothing drawn yet');
    } else {
        parts.push(count(drawing.elements, 'element'), count(drawing.layers, 'layer'));

        if (drawing.sheets !== null && drawing.sheets > 1) {
            parts.push(count(drawing.sheets, 'sheet'));
        }
    }

    const said = parts.filter((part): part is string => part !== null && part !== '');

    return said.length === 0 ? null : said.join(' · ');
}

/**
 * Who can reach the drawing, and how.
 *
 * Ordered by what the reader is most likely to be asking: whose drawing this is and what they
 * hold in it, then how it is exposed beyond that, then whether it is waiting on them. Each is
 * a phrase rather than a badge — the colour in this interface means selection, and a row of
 * tinted pills is the look this product is deliberately not.
 */
export function describeAccess(project: ProjectSummary): string[] {
    const parts: string[] = [];

    if (project.role === 'owner') {
        // Whose, when it is not simply yours. An admin holds `owner` in the firm's work as
        // well as in their own, and could not otherwise tell the two apart on one list.
        if ((project.organisationId ?? null) !== null) {
            parts.push(project.ownerName ?? 'A firm');
        }
    } else {
        parts.push(
            `${project.ownerName ?? 'Somebody else'}’s`,
            project.role === 'editor' ? 'you can edit' : 'you can comment',
        );
    }

    /*
     * 10.2c's state, which the card has never said. It is sent for every project and only ever
     * true of a firm's, and it is the difference between a drawing the office can open and one
     * only the people named on it can.
     */
    if (project.restricted === true) {
        parts.push('named people only');
    }

    /*
     * Both, when both are true: restriction is about the firm's default and a link is about
     * everybody else, and 9.4 decided deliberately that a link still works on a restricted
     * drawing. Saying only one of them would be hiding the other.
     */
    if (project.sharedRole !== null && project.sharedRole !== undefined) {
        parts.push(`link · ${project.sharedRole}`);
    }

    const open = project.openComments ?? 0;

    if (open > 0) {
        parts.push(`${open} open remark${open === 1 ? '' : 's'}`);
    }

    return parts;
}

/** 50 → "50", 12.5 → "12.5". The scale is stored as a number and read as a ratio. */
function formatScale(scale: number): string {
    return Number.isInteger(scale) ? String(scale) : String(Number(scale.toFixed(2)));
}
