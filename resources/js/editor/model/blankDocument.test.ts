import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { emptyDocument } from './document';
import { SCHEMA_VERSION } from './types';

/**
 * The one document that exists in two languages.
 *
 * A new drawing is created on the server, by `DocumentSchema::blank()`, and the client has to
 * be able to make the identical thing — for a document that never reached the server, and for
 * the parser's own defaults. So the layers, the sheet, the grid, the title block and the schema
 * version are all written out twice, in PHP and in TypeScript, and until now nothing held the
 * two copies to each other. `DocumentSchema.php` says as much in a comment: bump the version on
 * one side only and "the server would refuse every document the current client writes".
 *
 * `tests/fixtures/blank-document.json` is that document, committed, with its ULID removed
 * because it is the one field that is meant to differ. Both suites compare against it, so
 * whichever side is edited alone, one of them fails.
 */
const fixture: unknown = JSON.parse(
    // From the project root rather than from this module: these tests run under jsdom, where
    // `import.meta.url` is not a file URL. The same route `ui/contrast.test.ts` takes.
    readFileSync(join(process.cwd(), 'tests/fixtures/blank-document.json'), 'utf8'),
);

describe('a blank drawing', () => {
    it('is made the same way on both sides of the wire', () => {
        const { id: _generated, ...document } = emptyDocument('Ground floor');

        expect(document).toEqual(fixture);
    });

    it('carries the schema version the format document announces', () => {
        // The third copy of the number, and the one a reader meets first.
        const [heading] = readFileSync(
            join(process.cwd(), 'docs/document-format.md'),
            'utf8',
        ).split('\n');

        expect(heading).toBe(`# Document format — schema version ${SCHEMA_VERSION}`);
    });
});
