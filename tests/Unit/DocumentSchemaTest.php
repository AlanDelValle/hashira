<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;

it('creates a blank document with the five default layers in order', function (): void {
    $document = DocumentSchema::blank('Ground floor');

    expect($document['schemaVersion'])->toBe(DocumentSchema::CURRENT_VERSION)
        ->and($document['name'])->toBe('Ground floor')
        ->and($document['elements'])->toBe([])
        ->and(array_column($document['layers'], 'id'))->toBe([
            DocumentSchema::LAYER_ARCHITECTURE,
            DocumentSchema::LAYER_OPENINGS,
            DocumentSchema::LAYER_FURNITURE,
            DocumentSchema::LAYER_DIMENSIONS,
            DocumentSchema::LAYER_ANNOTATIONS,
        ])
        ->and(array_column($document['layers'], 'order'))->toBe([0, 1, 2, 3, 4]);
});

it('defaults a blank document to metric millimetre storage at 1:50', function (): void {
    $settings = DocumentSchema::blank('Plan')['settings'];

    expect($settings['unit'])->toBe('m')
        ->and($settings['scale'])->toBe(50)
        ->and($settings['grid']['size'])->toBe(100);
});

it('gives a blank document one sheet, framing whatever gets drawn', function (): void {
    $sheets = DocumentSchema::blank('Plan')['settings']['sheets'];

    expect($sheets)->toHaveCount(1)
        ->and($sheets[0]['id'])->toBe('sheet_1')
        ->and($sheets[0]['size'])->toBe('A3')
        ->and($sheets[0]['scale'])->toBe(DocumentSchema::blank('Plan')['settings']['scale'])
        // Null until somebody points it at part of the plan, which is what the drawing did
        // before it had sheets at all.
        ->and($sheets[0]['centre'])->toBeNull();
});

it('gives a blank document a title block with nothing in it yet', function (): void {
    $block = DocumentSchema::blank('Plan')['settings']['titleBlock'];

    // Empty rather than absent: the panel that edits it needs fields to put a caret in, and
    // an empty field is simply not printed.
    expect($block)->toBe([
        'project' => '',
        'client' => '',
        'drawnBy' => '',
        'revision' => '',
        'date' => '',
    ]);
});

it('accepts its own blank document', function (): void {
    expect(DocumentSchema::envelopeProblem(DocumentSchema::blank('Plan')))->toBeNull();
});

/*
 * The blank document exists twice — here and in model/document.ts — because a drawing is
 * created on the server and then made again by the client for the cases that never reach it.
 * Every default is therefore written out in two languages, and nothing used to hold the two
 * copies to each other: bump CURRENT_VERSION alone and this server refuses every document the
 * current client writes, which is a footgun the comment above it describes rather than catches.
 *
 * The fixture is that document, committed, with the ULID taken out because it is the one field
 * meant to differ. The client's suite compares against the same file, so whichever side is
 * edited on its own, one of the two suites fails.
 */
it('writes the same blank document the client does', function (): void {
    $document = DocumentSchema::blank('Ground floor');

    unset($document['id']);

    // Resolved from this file rather than through base_path(): a unit test does not boot the
    // application, and this one has no reason to start needing it.
    $fixture = json_decode(
        (string) file_get_contents(dirname(__DIR__).'/fixtures/blank-document.json'),
        associative: true,
    );

    expect($document)->toBe($fixture);
});

it('rejects payloads it could not read back', function (array $data, string $needle): void {
    expect(DocumentSchema::envelopeProblem($data))->toContain($needle);
})->with([
    'no version' => [['settings' => [], 'layers' => [], 'elements' => []], 'schema version'],
    'future version' => [
        ['schemaVersion' => 99, 'settings' => [], 'layers' => [], 'elements' => []],
        'newer version',
    ],
    'no settings' => [['schemaVersion' => 1, 'layers' => [], 'elements' => []], 'settings'],
    'no elements' => [['schemaVersion' => 1, 'settings' => [], 'layers' => []], 'elements'],
    'layers keyed instead of listed' => [
        ['schemaVersion' => 1, 'settings' => [], 'layers' => ['a' => []], 'elements' => []],
        'must be a list',
    ],
]);
