import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseDocument } from './document';

/**
 * The seeded drawing, read the way the editor reads it.
 *
 * The server writes this document and the client has to be able to open it, and until this
 * test there was nothing holding the two together: `blankDocument.test.ts` pins the empty
 * document, which has no elements, so the only geometry the server ever writes was unchecked.
 * It had been wrong for four schema versions — every dimension in a freshly seeded plan was
 * dropped on load, because the seed still wrote the shape a dimension had before schema 3 and
 * a seeded document is stamped current, so nothing migrated it.
 *
 * The fixture is written by `tests/Unit/DemoPlanTest.php` from the seeder itself, with the ids
 * and the timestamp made stable. Editing the seed without regenerating it fails there; moving
 * the format without the seed following fails here.
 */
const fixture: unknown = JSON.parse(
    // `import.meta.url` is not a file URL here, the same route the other fixture tests take.
    readFileSync(join(process.cwd(), 'tests/fixtures/demo-plan.json'), 'utf8'),
);

describe('the seeded drawing', () => {
    it('opens with nothing dropped', () => {
        const parsed = parseDocument(fixture);

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.dropped).toEqual([]);
    });

    it('keeps every element the seed put in it', () => {
        const parsed = parseDocument(fixture);
        const written = (fixture as { elements: unknown[] }).elements.length;

        expect(parsed.ok && parsed.document.elements).toHaveLength(written);
    });

    /*
     * Named rather than counted, because "fourteen elements" survives a dimension quietly
     * becoming a line. These are what the plan is: four walls, the two openings cut into them,
     * the four dimensions that set it out, its label, and the furniture standing in it.
     */
    it('is the drawing the landing page shows', () => {
        const parsed = parseDocument(fixture);
        const types = parsed.ok ? parsed.document.elements.map((element) => element.type) : [];

        expect(types.filter((type) => type === 'wall')).toHaveLength(4);
        expect(types.filter((type) => type === 'door')).toHaveLength(1);
        expect(types.filter((type) => type === 'window')).toHaveLength(1);
        expect(types.filter((type) => type === 'dimension')).toHaveLength(4);
        expect(types.filter((type) => type === 'text')).toHaveLength(1);
        expect(types.filter((type) => type === 'asset')).toHaveLength(3);
    });
});
