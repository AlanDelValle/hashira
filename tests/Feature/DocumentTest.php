<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

function projectWithDrawing(User $owner, string $name = 'Plan'): Project
{
    return app(CreateProject::class)->handle($owner, $name);
}

it('returns the drawing with its revision', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.revision', 0)
        ->assertJsonPath('data.schemaVersion', DocumentSchema::CURRENT_VERSION)
        ->assertJsonPath('data.drawing.elements', []);
});

it('persists a save and advances the revision', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $data = DocumentSchema::blank('Plan');
    $data['elements'] = [[
        'id' => 'wall-1',
        'type' => 'wall',
        'layerId' => DocumentSchema::LAYER_ARCHITECTURE,
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        'geometry' => [
            'a' => ['x' => 0, 'y' => 0],
            'b' => ['x' => 4000, 'y' => 0],
            'thickness' => 150,
        ],
    ]];

    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertOk()
        ->assertJsonPath('data.revision', 1);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertJsonPath('data.drawing.elements.0.geometry.b.x', 4000);
});

it('rejects a save based on a superseded revision', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);
    $data = DocumentSchema::blank('Plan');

    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertOk();

    // A second tab still believes it is editing revision 0.
    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertConflict()
        ->assertJsonPath('currentRevision', 1)
        ->assertJsonPath('expectedRevision', 0);

    expect($project->document->refresh()->revision)->toBe(1);
});

it('refuses a document written by a newer schema than this build knows', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $data = DocumentSchema::blank('Plan');
    $data['schemaVersion'] = DocumentSchema::CURRENT_VERSION + 1;

    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('data');
});

it('refuses a document that is missing its envelope', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $this->putJson("/api/projects/{$project->id}/document", [
        'revision' => 0,
        'data' => ['schemaVersion' => 1, 'layers' => []],
    ])->assertUnprocessable()->assertJsonValidationErrors('data');
});

/*
 * A drawing is data, and the request middleware used to treat it as form input.
 *
 * Laravel trims every string in a request and turns the empty ones into null. On this
 * endpoint it did that inside the document: an unfilled title-block field, a drawing with no
 * notes and a label somebody had cleared all reached the database as null, and the format
 * allows one nowhere it put them. What that cost was not the nulls — the settings reader
 * parsed the whole object at once, so one of them handed the editor its defaults for unit,
 * scale, grid, title, title block and notes together, and autosave then wrote those back over
 * what the drawing said. The reader is no longer all-or-nothing (model/document.ts) and the
 * exclusion is in bootstrap/app.php; these hold the endpoint to it, path and all.
 */
it('stores a drawing with the blank fields it was drawn with', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $data = DocumentSchema::blank('Plan');
    $data['settings']['titleBlock']['project'] = 'Maltings, unit 4';
    $data['settings']['notes'] = '';
    $data['elements'] = [[
        'id' => 'label-1',
        'type' => 'text',
        'layerId' => DocumentSchema::LAYER_ANNOTATIONS,
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        // A label whose words somebody rubbed out. The element is still on the sheet.
        'geometry' => ['content' => '', 'fontSize' => 200, 'align' => 'left'],
    ]];

    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertOk();

    $stored = $project->document->refresh()->data;

    // toEqual rather than toBe: jsonb stores an object as a map and hands its keys back in
    // its own order, which is not the order they were written in.
    expect($stored['settings']['titleBlock'])->toEqual([
        'project' => 'Maltings, unit 4',
        'client' => '',
        'drawnBy' => '',
        'revision' => '',
        'date' => '',
    ])
        ->and($stored['settings']['notes'])->toBe('')
        ->and($stored['elements'][0]['geometry']['content'])->toBe('');
});

it('stores the whitespace a drawing was written with', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    // Trimming is the other half of the same middleware, and a note is somebody's typing:
    // where their lines end and how they are indented is not the server's to tidy.
    $notes = "  All dimensions in millimetres.\nVerify on site.\n";

    $data = DocumentSchema::blank('Plan');
    $data['settings']['notes'] = $notes;

    $this->putJson("/api/projects/{$project->id}/document", ['revision' => 0, 'data' => $data])
        ->assertOk();

    expect($project->document->refresh()->data['settings']['notes'])->toBe($notes);
});

it('repairs the drawings that were emptied before the endpoint was excluded', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);
    $document = $project->document;

    DB::table('documents')
        ->where('id', $document->id)
        ->update(['data' => json_encode(nulledDocument(), JSON_THROW_ON_ERROR)]);

    $version = $document->versions()->create([
        'label' => 'Before the rework',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'revision' => 0,
        'data' => nulledDocument(),
    ]);

    $before = DB::table('documents')->where('id', $document->id)->sole();

    /** @var Migration $migration */
    $migration = require database_path(
        'migrations/2026_09_04_130000_repair_documents_emptied_by_middleware.php',
    );

    $migration->up();

    $repaired = $document->refresh()->data;
    $after = DB::table('documents')->where('id', $document->id)->sole();

    expect($repaired['settings']['notes'])->toBe('')
        ->and($repaired['settings']['titleBlock']['client'])->toBe('')
        ->and($repaired['settings']['titleBlock']['project'])->toBe('Maltings, unit 4')
        // The label the parser was dropping, back on the sheet where somebody put it.
        ->and($repaired['elements'][1]['geometry']['content'])->toBe('')
        // A snapshot is what was saved, and this is what was saved. Restoring a version must
        // not be a way of losing that label a second time.
        ->and($version->refresh()->data['settings']['notes'])->toBe('')
        // A tab with the drawing open can still save, and the dashboard's ordering does not
        // move: a repair is not activity.
        ->and($after->revision)->toBe($before->revision)
        ->and($after->updated_at)->toBe($before->updated_at);
});

it('does not let another user save over a drawing', function (): void {
    $owner = User::factory()->create();
    $project = projectWithDrawing($owner);

    signedIn(User::factory()->create());

    $this->putJson("/api/projects/{$project->id}/document", [
        'revision' => 0,
        'data' => DocumentSchema::blank('Plan'),
    ])->assertNotFound();

    expect($project->document->refresh()->revision)->toBe(0);
});

it('snapshots a version on request', function (): void {
    $owner = signedIn();
    $project = projectWithDrawing($owner);

    $this->postJson("/api/projects/{$project->id}/versions", ['label' => 'Before the rework'])
        ->assertCreated()
        ->assertJsonPath('data.label', 'Before the rework')
        ->assertJsonPath('data.revision', 0);

    $this->getJson("/api/projects/{$project->id}/versions")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        // Listings carry metadata only; the payload is fetched one version at a time.
        ->assertJsonMissingPath('data.0.drawing');
});
