<?php

declare(strict_types=1);

use App\Domain\Documents\Events\OperationApplied;
use App\Domain\Documents\Models\DocumentOperation;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\ShareRole;
use App\Models\User;
use Illuminate\Support\Facades\Event;

/*
 * Phase 9.2a. The edit log: one person's change reaching another, in an order both agree on.
 */

/** A believable envelope. Its meaning is the client's business; this end only orders it. */
function envelope(string $label = 'Wall'): array
{
    return [
        'type' => 'addElements',
        'label' => $label,
        'elements' => [],
    ];
}

function joinsProject(Project $project, User $user, ShareRole $role): void
{
    $member = new ProjectMember;
    $member->project_id = $project->id;
    $member->user_id = (int) $user->getKey();
    $member->role = $role;
    $member->joined_at = now();
    $member->save();
}

it('accepts an edit and gives it the next number', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])
        ->assertCreated()
        ->assertJsonPath('data.sequence', 1)
        ->assertJsonPath('data.origin', 'browser-a')
        ->assertJsonPath('data.envelope.label', 'Wall');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope('Door'),
        'origin' => 'browser-a',
    ])
        ->assertCreated()
        ->assertJsonPath('data.sequence', 2);

    expect($project->document->fresh()->operation_sequence)->toBe(2);
});

/*
 * The number comes from a column that is incremented, not from counting the log. If it ever
 * comes from `max(sequence) + 1` again, two edits landing together will collide on this.
 */
it('never hands the same number to two edits', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    foreach (range(1, 8) as $ignored) {
        $this->postJson("/api/projects/{$project->id}/operations", [
            'envelope' => envelope(),
            'origin' => 'browser-a',
        ])->assertCreated();
    }

    $sequences = DocumentOperation::query()->pluck('sequence');

    expect($sequences->unique())->toHaveCount(8)
        ->and($sequences->sort()->values()->all())->toBe([1, 2, 3, 4, 5, 6, 7, 8]);
});

it('numbers each drawing on its own', function (): void {
    $owner = signedIn();
    $one = app(CreateProject::class)->handle($owner, 'One');
    $two = app(CreateProject::class)->handle($owner, 'Two');

    $this->postJson("/api/projects/{$one->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])->assertCreated();

    $this->postJson("/api/projects/{$two->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])
        ->assertCreated()
        ->assertJsonPath('data.sequence', 1);
});

it('sends the edit on to everybody else looking at the drawing', function (): void {
    Event::fake([OperationApplied::class]);

    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])->assertCreated();

    Event::assertDispatched(OperationApplied::class);
});

/*
 * Somebody who opened the drawing a minute late loaded a snapshot with a sequence on it, and
 * asks for everything after it. Without this there is a window where a reader is quietly
 * behind, which is worse than being visibly behind.
 */
it('hands back everything after a given point, and nothing before it', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    foreach (['One', 'Two', 'Three'] as $label) {
        $this->postJson("/api/projects/{$project->id}/operations", [
            'envelope' => envelope($label),
            'origin' => 'browser-a',
        ])->assertCreated();
    }

    $this->getJson("/api/projects/{$project->id}/operations?after=1")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.envelope.label', 'Two')
        ->assertJsonPath('data.1.envelope.label', 'Three');

    $this->getJson("/api/projects/{$project->id}/operations?after=3")
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('tells the drawing where its snapshot sits in the log', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.sequence', 0);

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])->assertCreated();

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.sequence', 1);
});

it('lets an editor write to the log and a commenter only read it', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $reviewer = signedIn();
    joinsProject($project, $reviewer, ShareRole::Commenter);

    $this->getJson("/api/projects/{$project->id}/operations")->assertOk();
    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-b',
    ])->assertForbidden();

    $editor = signedIn();
    joinsProject($project, $editor, ShareRole::Editor);

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-c',
    ])->assertCreated();
});

it('tells a stranger the log is not there', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    signedIn();

    $this->getJson("/api/projects/{$project->id}/operations")->assertNotFound();
    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-b',
    ])->assertNotFound();
});

it('refuses an edit with no envelope in it', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/operations", ['origin' => 'browser-a'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('envelope');

    expect(DocumentOperation::query()->count())->toBe(0);
});

it('takes the log with the project', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => envelope(),
        'origin' => 'browser-a',
    ])->assertCreated();

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    expect(DocumentOperation::query()->count())->toBe(0);
});
