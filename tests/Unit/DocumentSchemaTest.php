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

it('accepts its own blank document', function (): void {
    expect(DocumentSchema::envelopeProblem(DocumentSchema::blank('Plan')))->toBeNull();
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
