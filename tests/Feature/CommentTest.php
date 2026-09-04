<?php

declare(strict_types=1);

use App\Domain\Comments\Models\Comment;
use App\Domain\Comments\Models\CommentThread;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\ShareRole;
use App\Models\User;

/*
 * Phase 9.3a. A remark made at a place on a drawing, and the conversation that follows it.
 */

/** Put somebody into a project the way an accepted link would. */
function joins(Project $project, User $user, ShareRole $role): ProjectMember
{
    $member = new ProjectMember;
    $member->project_id = $project->id;
    $member->user_id = (int) $user->getKey();
    $member->role = $role;
    $member->joined_at = now();
    $member->save();

    return $member;
}

it('drops a pin and says the first thing at it, in one act', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 1234.5,
        'y' => -600.25,
        'body' => '  This corner is too tight.  ',
    ])
        ->assertCreated()
        ->assertJsonPath('data.x', 1234.5)
        ->assertJsonPath('data.y', -600.25)
        ->assertJsonPath('data.resolved', false)
        ->assertJsonPath('data.authorName', $owner->name)
        ->assertJsonCount(1, 'data.comments')
        ->assertJsonPath('data.comments.0.body', 'This corner is too tight.');

    expect(CommentThread::query()->count())->toBe(1)
        ->and(Comment::query()->count())->toBe(1);
});

it('remembers which element the pin was dropped on, without letting it move the pin', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 100,
        'y' => 200,
        'elementId' => 'el_wall_1',
        'body' => 'Thicken this.',
    ])
        ->assertCreated()
        ->assertJsonPath('data.elementId', 'el_wall_1')
        ->assertJsonPath('data.x', 100);
});

it('refuses a remark with nothing said in it', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('body');

    expect(CommentThread::query()->count())->toBe(0);
});

it('lists open threads before resolved ones', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Older']);
    $resolved = CommentThread::query()->sole();
    $this->patchJson("/api/projects/{$project->id}/comments/{$resolved->id}", ['resolved' => true]);

    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 1, 'y' => 1, 'body' => 'Newer']);

    $this->getJson("/api/projects/{$project->id}/comments")
        ->assertOk()
        ->assertJsonPath('data.0.comments.0.body', 'Newer')
        ->assertJsonPath('data.0.resolved', false)
        ->assertJsonPath('data.1.resolved', true);
});

it('lets a commenter answer, and an editor answer back', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $reviewer = signedIn();
    joins($project, $reviewer, ShareRole::Commenter);

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => 'Is this door wide enough?',
    ])->assertCreated();

    $thread = CommentThread::query()->sole();

    signedIn($owner);

    $this->postJson("/api/projects/{$project->id}/comments/{$thread->id}/replies", [
        'body' => 'It is 900.',
    ])
        ->assertCreated()
        ->assertJsonPath('data.authorName', $owner->name);

    $this->getJson("/api/projects/{$project->id}/comments")
        ->assertOk()
        ->assertJsonCount(2, 'data.0.comments')
        ->assertJsonPath('data.0.comments.0.authorName', $reviewer->name)
        ->assertJsonPath('data.0.comments.1.authorName', $owner->name);
});

it('resolves a thread and puts it back, recording who settled it', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Check.']);
    $thread = CommentThread::query()->sole();

    $this->patchJson("/api/projects/{$project->id}/comments/{$thread->id}", ['resolved' => true])
        ->assertOk()
        ->assertJsonPath('data.resolved', true);

    expect($thread->fresh()->resolved_by)->toBe($owner->getKey());

    $this->patchJson("/api/projects/{$project->id}/comments/{$thread->id}", ['resolved' => false])
        ->assertOk()
        ->assertJsonPath('data.resolved', false);

    expect($thread->fresh()->resolved_by)->toBeNull();
});

/*
 * Answering a resolved thread is allowed on purpose: "that is not quite right" is exactly what
 * somebody needs to say about a point closed too early.
 */
it('lets somebody answer a thread that was already resolved', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Check.']);
    $thread = CommentThread::query()->sole();
    $this->patchJson("/api/projects/{$project->id}/comments/{$thread->id}", ['resolved' => true]);

    $this->postJson("/api/projects/{$project->id}/comments/{$thread->id}/replies", [
        'body' => 'Not quite.',
    ])->assertCreated();
});

it('tells a stranger the conversations are not there', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    signedIn();

    $this->getJson("/api/projects/{$project->id}/comments")->assertNotFound();
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Hello'])
        ->assertNotFound();
});

it('answers 404 for a thread reached through the wrong project', function (): void {
    $owner = signedIn();
    $mine = app(CreateProject::class)->handle($owner, 'Mine');
    $other = app(CreateProject::class)->handle($owner, 'Other');

    $this->postJson("/api/projects/{$mine->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Here']);
    $thread = CommentThread::query()->sole();

    $this->patchJson("/api/projects/{$other->id}/comments/{$thread->id}", ['resolved' => true])
        ->assertNotFound();
});

it('takes the whole conversation when a thread is deleted', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Check.']);
    $thread = CommentThread::query()->sole();
    $this->postJson("/api/projects/{$project->id}/comments/{$thread->id}/replies", ['body' => 'Done.']);

    $this->deleteJson("/api/projects/{$project->id}/comments/{$thread->id}")->assertNoContent();

    expect(CommentThread::query()->count())->toBe(0)
        ->and(Comment::query()->count())->toBe(0);
});

it('keeps a thread from being deleted by somebody who neither started it nor owns the drawing', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $author = signedIn();
    joins($project, $author, ShareRole::Commenter);
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Mine']);
    $thread = CommentThread::query()->sole();

    $bystander = signedIn();
    joins($project, $bystander, ShareRole::Editor);

    $this->deleteJson("/api/projects/{$project->id}/comments/{$thread->id}")->assertForbidden();

    // Its author may, and so may the owner.
    signedIn($author);
    $this->deleteJson("/api/projects/{$project->id}/comments/{$thread->id}")->assertNoContent();
});

it('refuses to delete the remark a thread was started with, on its own', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $first = $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => 'First',
    ])->json('data.comments.0.id');

    $thread = CommentThread::query()->sole();

    $second = $this->postJson("/api/projects/{$project->id}/comments/{$thread->id}/replies", [
        'body' => 'Second',
    ])->json('data.id');

    // Both ids come from the API rather than from sorting, because sorting is exactly what
    // ties when two rows land in the same millisecond.
    $this->deleteJson("/api/projects/{$project->id}/comments/{$thread->id}/replies/{$first}")
        ->assertStatus(409);

    $this->deleteJson("/api/projects/{$project->id}/comments/{$thread->id}/replies/{$second}")
        ->assertNoContent();

    expect($thread->comments()->count())->toBe(1);
});

it('leaves the words behind when the account that wrote them is deleted', function (): void {
    $owner = User::factory()->create();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $reviewer = signedIn();
    joins($project, $reviewer, ShareRole::Commenter);
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Still here']);

    $reviewer->delete();

    signedIn($owner);

    $this->getJson("/api/projects/{$project->id}/comments")
        ->assertOk()
        ->assertJsonPath('data.0.comments.0.body', 'Still here')
        ->assertJsonPath('data.0.comments.0.authorName', null);
});

it('takes the conversations with the project', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Check.']);

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    expect(CommentThread::query()->count())->toBe(0)
        ->and(Comment::query()->count())->toBe(0);
});

/*
 * Mentions. Resolved on the server and nowhere else, so the picture and the record cannot
 * disagree about who was addressed.
 */

it('records who a remark was aimed at, and the text as it was typed', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $editor = User::factory()->create(['name' => 'Ana Paula']);
    joins($project, $editor, ShareRole::Editor);

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => '@Ana Paula can you check this?',
    ])
        ->assertCreated()
        ->assertJsonPath('data.comments.0.mentions.0.userId', $editor->getKey())
        ->assertJsonPath('data.comments.0.mentions.0.text', '@Ana Paula');
});

it('prefers the longest name, so a short one does not eat a long one', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $short = User::factory()->create(['name' => 'Ana']);
    $long = User::factory()->create(['name' => 'Ana Paula']);
    joins($project, $short, ShareRole::Commenter);
    joins($project, $long, ShareRole::Commenter);

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => '@Ana Paula please look',
    ])
        ->assertCreated()
        ->assertJsonCount(1, 'data.comments.0.mentions')
        ->assertJsonPath('data.comments.0.mentions.0.userId', $long->getKey());
});

it('leaves an @ that names nobody on the project as plain text', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $stranger = User::factory()->create(['name' => 'Nobody Here']);

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => 'The door is at @900mm, ask @Nobody Here',
    ])
        ->assertCreated()
        ->assertJsonCount(0, 'data.comments.0.mentions');

    expect($stranger->fresh())->not->toBeNull();
});

it('records one row however often somebody is named', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $editor = User::factory()->create(['name' => 'Ana']);
    joins($project, $editor, ShareRole::Editor);

    $this->postJson("/api/projects/{$project->id}/comments", [
        'x' => 0,
        'y' => 0,
        'body' => '@Ana and again @Ana',
    ])
        ->assertCreated()
        ->assertJsonCount(1, 'data.comments.0.mentions');
});

it('resolves mentions in an answer, not only in the opening remark', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $editor = User::factory()->create(['name' => 'Ana']);
    joins($project, $editor, ShareRole::Editor);

    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Check']);
    $thread = CommentThread::query()->sole();

    $this->postJson("/api/projects/{$project->id}/comments/{$thread->id}/replies", [
        'body' => 'Over to @Ana',
    ])
        ->assertCreated()
        ->assertJsonPath('data.mentions.0.userId', $editor->getKey());
});

it('keeps what was typed when the person named later renames their account', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Studio');
    $editor = User::factory()->create(['name' => 'Ana']);
    joins($project, $editor, ShareRole::Editor);

    $this->postJson("/api/projects/{$project->id}/comments", ['x' => 0, 'y' => 0, 'body' => 'Ask @Ana']);

    $editor->forceFill(['name' => 'Ana Paula'])->save();

    // The remark still reads as it was written; only the name beside it has moved on.
    $this->getJson("/api/projects/{$project->id}/comments")
        ->assertOk()
        ->assertJsonPath('data.0.comments.0.mentions.0.text', '@Ana')
        ->assertJsonPath('data.0.comments.0.mentions.0.name', 'Ana Paula');
});

it('lists who can be mentioned, without naming their accounts', function (): void {
    $owner = User::factory()->create(['name' => 'The Owner']);
    $project = app(CreateProject::class)->handle($owner, 'Studio');

    $reviewer = signedIn();
    joins($project, $reviewer, ShareRole::Commenter);

    $response = $this->getJson("/api/projects/{$project->id}/people")->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('data.0'))->toHaveKeys(['id', 'name'])
        ->and($response->json('data.0'))->not->toHaveKey('email');

    // A stranger cannot read the roster at all.
    signedIn();
    $this->getJson("/api/projects/{$project->id}/people")->assertNotFound();
});
