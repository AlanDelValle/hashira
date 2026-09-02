<?php

declare(strict_types=1);

use Database\Seeders\DemoPlan;

/**
 * The seed, held to the format the client reads.
 *
 * `DocumentSchemaTest` already pins the blank document against a fixture the client's suite
 * reads too — but a blank document has no elements in it, which is exactly why it never caught
 * this: the demo plan is the only place the server writes real geometry, and nothing checked
 * that geometry against the one thing that has to be able to read it.
 *
 * It went wrong the obvious way. A dimension became a run of points in schema 3, the seed went
 * on writing `a` and `b`, and because a seeded document is stamped with the current version
 * nothing migrated it: the client dropped all four dimensions on load. Four schema versions
 * and nobody saw it, because a development database is seeded once and then lived in.
 *
 * So the fixture is that document with the two fields that are meant to differ made stable —
 * the random ids and the time it was made — and the client's suite reads the same file. Edit
 * the seed alone and this fails; move the format alone and the client's suite fails.
 */
it('writes a demo plan the client can read back', function (): void {
    $fixture = json_decode(
        (string) file_get_contents(dirname(__DIR__).'/fixtures/demo-plan.json'),
        associative: true,
    );

    expect(stable(DemoPlan::document('Bedroom')))->toBe($fixture);
});

/**
 * The document with everything random in it replaced by something repeatable: element ids
 * become their position, references to them follow, and the timestamp becomes a fixed one.
 *
 * @param  array<string, mixed>  $document
 * @return array<string, mixed>
 */
function stable(array $document): array
{
    /** @var list<array<string, mixed>> $elements */
    $elements = $document['elements'];

    $ids = [];

    foreach ($elements as $index => $element) {
        $ids[$element['id']] = 'el_'.$index;
    }

    $document['id'] = 'demo';
    $document['elements'] = array_map(function (array $element) use ($ids): array {
        $element['id'] = $ids[$element['id']];
        $element['metadata'] = ['createdAt' => '2026-01-01T00:00:00+00:00'];

        /** @var array<string, mixed> $geometry */
        $geometry = $element['geometry'];

        if (array_key_exists('hostId', $geometry)) {
            $geometry['hostId'] = $ids[$geometry['hostId']];
            $element['geometry'] = $geometry;
        }

        return $element;
    }, $elements);

    return $document;
}
