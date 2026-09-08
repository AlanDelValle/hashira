<?php

declare(strict_types=1);

use App\Domain\Comments\Models\CommentThread;
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

describe('what the list says about each drawing', function (): void {
    it('counts the drawing in the database rather than sending it', function (): void {
        $owner = signedIn();
        $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Studio']);

        $data = DocumentSchema::blank('Studio');
        $data['elements'] = [
            ['id' => 'a', 'type' => 'line'],
            ['id' => 'b', 'type' => 'line'],
            ['id' => 'c', 'type' => 'line'],
        ];
        $data['settings']['sheets'][0]['size'] = 'A1';
        $data['settings']['sheets'][0]['scale'] = 100;

        $project->documents()->create([
            'name' => 'Studio',
            'schema_version' => DocumentSchema::CURRENT_VERSION,
            'data' => $data,
        ]);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('data.0.drawing.sheet', 'A1')
            ->assertJsonPath('data.0.drawing.scale', 100)
            ->assertJsonPath('data.0.drawing.elements', 3)
            ->assertJsonPath('data.0.drawing.layers', 5)
            ->assertJsonPath('data.0.drawing.sheets', 1);
    });

    it('summarises a project that has no drawing as nothing at all', function (): void {
        $owner = signedIn();
        Project::factory()->for($owner, 'owner')->create();

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('data.0.drawing', null);
    });

    /*
     * The counts are taken with jsonb_array_length, which raises rather than answering null
     * when what it is pointed at is not an array. The envelope guarantees `elements` and
     * `layers`; nothing guarantees the interior of `settings`, and a list that will not load
     * because one drawing is odd is worse than a card missing a figure.
     */
    it('still lists a drawing whose settings cannot be read', function (): void {
        $owner = signedIn();
        $project = Project::factory()->for($owner, 'owner')->create();

        $data = DocumentSchema::blank('Odd');
        $data['settings']['sheets'] = 'not a list';

        $project->documents()->create([
            'name' => 'Odd',
            'schema_version' => DocumentSchema::CURRENT_VERSION,
            'data' => $data,
        ]);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('data.0.drawing.sheets', null)
            ->assertJsonPath('data.0.drawing.sheet', null)
            ->assertJsonPath('data.0.drawing.elements', 0);
    });

    it('says what an active share link hands out, and counts the open conversations', function (): void {
        $owner = signedIn();
        $project = Project::factory()->for($owner, 'owner')->create();

        $this->postJson("/api/projects/{$project->id}/share", ['role' => 'editor'])
            ->assertCreated();

        $this->postJson("/api/projects/{$project->id}/comments", [
            'x' => 0,
            'y' => 0,
            'body' => 'Still open.',
        ])->assertCreated();

        $this->postJson("/api/projects/{$project->id}/comments", [
            'x' => 1,
            'y' => 1,
            'body' => 'Settled.',
        ])->assertCreated();

        $settled = CommentThread::query()->latest('created_at')->firstOrFail();
        $this->patchJson("/api/projects/{$project->id}/comments/{$settled->id}", [
            'resolved' => true,
        ])->assertOk();

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('data.0.sharedRole', 'editor')
            ->assertJsonPath('data.0.openComments', 1);
    });
});
