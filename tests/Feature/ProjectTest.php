<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Models\Project;
use App\Models\User;

it('creates a project together with a blank drawing', function (): void {
    signedIn();

    $response = $this->postJson('/api/projects', ['name' => 'Ground floor']);

    $response->assertCreated()->assertJsonPath('data.name', 'Ground floor');

    $project = Project::query()->sole();

    expect($project->document)->not->toBeNull()
        ->and($project->document->schema_version)->toBe(DocumentSchema::CURRENT_VERSION)
        ->and($project->document->data['elements'])->toBe([])
        ->and($project->document->data['layers'])->toHaveCount(5);
});

it('lists only the projects belonging to the caller', function (): void {
    $owner = signedIn();

    Project::factory()->for($owner, 'owner')->create(['name' => 'Mine']);
    Project::factory()->create(['name' => 'Someone else’s']);

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Mine');
});

it('renames a project', function (): void {
    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Untitled']);

    $this->patchJson("/api/projects/{$project->id}", ['name' => 'Apartment'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Apartment');
});

it('duplicates a project with its drawing but without its share links', function (): void {
    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Studio']);
    $project->documents()->create([
        'name' => 'Studio',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => DocumentSchema::blank('Studio'),
    ]);
    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();

    $this->postJson("/api/projects/{$project->id}/duplicate")
        ->assertCreated()
        ->assertJsonPath('data.name', 'Studio (copy)');

    $copy = Project::query()->where('name', 'Studio (copy)')->sole();

    expect($copy->document)->not->toBeNull()
        ->and($copy->shareLinks()->count())->toBe(0);
});

it('deletes a project and its drawing', function (): void {
    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();
    $project->documents()->create([
        'name' => 'Plan',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => DocumentSchema::blank('Plan'),
    ]);

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    $this->assertDatabaseCount('projects', 0);
    $this->assertDatabaseCount('documents', 0);
});

describe('another user', function (): void {
    it('cannot read, change or delete a project that is not theirs', function (string $method, string $suffix): void {
        $stranger = Project::factory()->create();
        signedIn(User::factory()->create());

        $this->json($method, "/api/projects/{$stranger->id}{$suffix}")
            ->assertNotFound();
    })->with([
        'view' => ['GET', ''],
        'update' => ['PATCH', ''],
        'delete' => ['DELETE', ''],
        'read the drawing' => ['GET', '/document'],
        'duplicate' => ['POST', '/duplicate'],
        'share' => ['POST', '/share'],
    ]);
});

it('refuses every project route to a guest', function (): void {
    $this->getJson('/api/projects')->assertUnauthorized();
});
