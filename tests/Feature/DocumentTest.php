<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Models\User;

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
