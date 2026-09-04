<?php

declare(strict_types=1);

use App\Domain\Documents\EmptiedStrings;

it('puts back the empty strings a title block was saved with', function (): void {
    $settings = EmptiedStrings::restoredIn(nulledDocument())['settings'];

    expect($settings['titleBlock'])->toBe([
        // The one field somebody had filled in was never in danger; it is the four beside it
        // that came back as null and took the whole settings object down with them.
        'project' => 'Maltings, unit 4',
        'client' => '',
        'drawnBy' => '',
        'revision' => '',
        'date' => '',
    ])->and($settings['notes'])->toBe('');
});

it('puts back the words of a label that was cleared', function (): void {
    $elements = EmptiedStrings::restoredIn(nulledDocument())['elements'];

    // Not the words — those were empty when they were typed. What comes back is the element:
    // a null here is content the parser refuses, so the label was dropped on load and then
    // autosaved out of the drawing entirely.
    expect($elements[1]['geometry']['content'])->toBe('')
        ->and($elements[1]['id'])->toBe('el_label');
});

it('leaves the nulls a drawing is entitled to', function (): void {
    $document = EmptiedStrings::restoredIn(nulledDocument());

    expect($document['settings']['sheets'][0]['centre'])->toBeNull()
        ->and($document['elements'][0]['style']['fill'])->toBeNull()
        ->and($document['elements'][0]['style']['lineType'])->toBeNull()
        ->and($document['elements'][0]['metadata']['label'])->toBeNull();
});

it('changes nothing else about the drawing', function (): void {
    $before = nulledDocument();
    $after = EmptiedStrings::restoredIn($before);

    expect($after['settings']['unit'])->toBe($before['settings']['unit'])
        ->and($after['settings']['scale'])->toBe($before['settings']['scale'])
        ->and($after['settings']['grid'])->toBe($before['settings']['grid'])
        ->and($after['settings']['snapping'])->toBe($before['settings']['snapping'])
        ->and($after['settings']['sheets'])->toBe($before['settings']['sheets'])
        ->and($after['layers'])->toBe($before['layers'])
        ->and($after['elements'][0])->toBe($before['elements'][0]);
});

it('is safe to run twice', function (): void {
    $once = EmptiedStrings::restoredIn(nulledDocument());

    expect(EmptiedStrings::restoredIn($once))->toBe($once);
});

it('does not invent a field the drawing never carried', function (): void {
    $document = EmptiedStrings::restoredIn([
        'schemaVersion' => 10,
        'settings' => ['titleBlock' => []],
        'layers' => [],
        'elements' => [],
    ]);

    // Filling a blank the drawing does not carry is the reader's job; it has defaults for it,
    // and a repair that adds keys is a repair that changes the format.
    expect($document['settings'])->toBe(['titleBlock' => []]);
});

it('is unbothered by a document that is not shaped like one', function (): void {
    expect(EmptiedStrings::restoredIn(['schemaVersion' => 10]))->toBe(['schemaVersion' => 10])
        ->and(EmptiedStrings::restoredIn(['settings' => 'nonsense', 'elements' => 'nonsense']))
        ->toBe(['settings' => 'nonsense', 'elements' => 'nonsense']);
});
