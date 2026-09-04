<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\Actions\IssueShareLink;
use App\Domain\Sharing\Models\ShareLink;
use App\Domain\Sharing\ShareRole;
use App\Models\User;
use Illuminate\Testing\TestResponse;

/*
 * Phase 9.4 — the second person. What a link may offer, what accepting one writes down, and
 * what the policy says afterwards.
 */

function collaborativeProject(User $owner, string $name = 'Studio'): Project
{
    return app(CreateProject::class)->handle($owner, $name);
}

function linkTo(Project $project, ShareRole $role): ShareLink
{
    return app(IssueShareLink::class)->handle(
        project: $project,
        issuer: $project->owner,
        role: $role,
    );
}

/** Take up a link as the signed-in user and hand back the response. */
function accept(ShareLink $link): TestResponse
{
    return test()->postJson("/api/share/{$link->token}/accept");
}

it('issues a link at the role that was asked for', function (): void {
    $project = collaborativeProject(signedIn());

    $this->postJson("/api/projects/{$project->id}/share", ['role' => 'editor'])
        ->assertCreated()
        ->assertJsonPath('data.role', 'editor');
});

it('issues a viewer link when no role is named', function (): void {
    $project = collaborativeProject(signedIn());

    $this->postJson("/api/projects/{$project->id}/share")
        ->assertCreated()
        ->assertJsonPath('data.role', 'viewer');
});

it('refuses a role that is not one of the three', function (): void {
    $project = collaborativeProject(signedIn());

    $this->postJson("/api/projects/{$project->id}/share", ['role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
});

it('serves an editor link read-only to somebody who is not signed in', function (): void {
    $link = linkTo(collaborativeProject(User::factory()->create()), ShareRole::Editor);

    $this->getJson("/api/share/{$link->token}")
        ->assertOk()
        ->assertJsonPath('data.role', 'editor');
});

it('never lets a viewer link be taken up', function (): void {
    $link = linkTo(collaborativeProject(User::factory()->create()), ShareRole::Viewer);

    signedIn();

    // The same 404 an unknown token gets: a caller learns nothing by asking.
    accept($link)->assertNotFound();

    expect(ProjectMember::query()->count())->toBe(0);
});

it('refuses to take up a link that has been revoked', function (): void {
    $link = linkTo(collaborativeProject(User::factory()->create()), ShareRole::Editor);
    $link->forceFill(['revoked_at' => now()])->save();

    signedIn();

    accept($link)->assertNotFound();
});

it('refuses to take up a link without an account', function (): void {
    $link = linkTo(collaborativeProject(User::factory()->create()), ShareRole::Editor);

    accept($link)->assertUnauthorized();
});

it('makes an editor out of whoever takes up an editor link', function (): void {
    $owner = User::factory()->create();
    $project = collaborativeProject($owner);
    $link = linkTo($project, ShareRole::Editor);

    $editor = signedIn();

    accept($link)
        ->assertOk()
        ->assertJsonPath('data.id', $project->id)
        ->assertJsonPath('data.role', 'editor')
        ->assertJsonPath('data.ownerName', $owner->name);

    $this->getJson("/api/projects/{$project->id}/document")->assertOk();

    $this->putJson("/api/projects/{$project->id}/document", [
        'revision' => $project->document->revision,
        'data' => DocumentSchema::blank('Studio'),
    ])->assertOk();

    expect(ProjectMember::query()->sole())
        ->user_id->toBe($editor->getKey())
        ->role->toBe(ShareRole::Editor)
        ->share_link_id->toBe($link->id);
});

it('lets a commenter look at the drawing but not change it', function (): void {
    $project = collaborativeProject(User::factory()->create());

    signedIn();
    accept(linkTo($project, ShareRole::Commenter))->assertOk();

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.role', 'commenter');

    $this->putJson("/api/projects/{$project->id}/document", [
        'revision' => $project->document->revision,
        'data' => DocumentSchema::blank('Studio'),
    ])->assertForbidden();
});

it('tells a stranger the project is not there, and a member only that they may not', function (): void {
    $project = collaborativeProject(User::factory()->create());

    // Nobody at all: the project must not even be admitted to exist.
    signedIn();
    $this->getJson("/api/projects/{$project->id}")->assertNotFound();

    // In the project, but not for this. Pretending it is missing would be a lie they can
    // see through, since the drawing is on their screen.
    accept(linkTo($project, ShareRole::Commenter))->assertOk();

    $this->getJson("/api/projects/{$project->id}")->assertOk();
    $this->deleteJson("/api/projects/{$project->id}")->assertForbidden();
    $this->postJson("/api/projects/{$project->id}/share")->assertForbidden();
    $this->getJson("/api/projects/{$project->id}/members")->assertForbidden();
});

it('takes up a link twice without writing a second membership', function (): void {
    $link = linkTo(collaborativeProject(User::factory()->create()), ShareRole::Editor);

    signedIn();
    accept($link)->assertOk();
    accept($link)->assertOk();

    expect(ProjectMember::query()->count())->toBe(1);
});

it('never lowers a role somebody already holds', function (): void {
    $project = collaborativeProject(User::factory()->create());

    signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();

    // The owner issues a commenter link for somebody else, and the editor opens that too.
    accept(linkTo($project, ShareRole::Commenter))->assertOk();

    expect(ProjectMember::query()->sole()->role)->toBe(ShareRole::Editor);
});

it('records nothing when the owner opens their own link', function (): void {
    $owner = signedIn();

    accept(linkTo(collaborativeProject($owner), ShareRole::Editor))->assertOk();

    expect(ProjectMember::query()->count())->toBe(0);
});

it('keeps a member when the link they came in through is replaced and revoked', function (): void {
    $owner = User::factory()->create();
    $project = collaborativeProject($owner);

    signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();

    // A fresh link revokes the old one; revoking then closes the door entirely. Neither is
    // meant to evict somebody who is already inside.
    signedIn($owner);
    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();
    $this->deleteJson("/api/projects/{$project->id}/share")->assertNoContent();

    expect(ProjectMember::query()->count())->toBe(1);
});

it('lists the members to their owner, with the account each one used', function (): void {
    $owner = User::factory()->create();
    $project = collaborativeProject($owner);

    $editor = signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();

    signedIn($owner);

    $this->getJson("/api/projects/{$project->id}/members")
        ->assertOk()
        ->assertJsonPath('data.0.email', $editor->email)
        ->assertJsonPath('data.0.role', 'editor');
});

it('removes a member, and the project goes back to being invisible to them', function (): void {
    $owner = User::factory()->create();
    $project = collaborativeProject($owner);

    $editor = signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();
    $member = ProjectMember::query()->sole();

    signedIn($owner);
    $this->deleteJson("/api/projects/{$project->id}/members/{$member->id}")->assertNoContent();

    signedIn($editor);
    $this->getJson("/api/projects/{$project->id}")->assertNotFound();
});

it('lets a member show themselves out without asking the owner', function (): void {
    $project = collaborativeProject(User::factory()->create());

    signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();
    $member = ProjectMember::query()->sole();

    $this->deleteJson("/api/projects/{$project->id}/members/{$member->id}")->assertNoContent();

    expect(ProjectMember::query()->count())->toBe(0);
});

it('lists a project somebody was let into, saying whose it is', function (): void {
    $owner = User::factory()->create();
    $project = collaborativeProject($owner, 'Rooftop');

    signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Rooftop')
        ->assertJsonPath('data.0.role', 'editor')
        ->assertJsonPath('data.0.ownerName', $owner->name);
});

it('gives an editor who duplicates a drawing the copy in their own account', function (): void {
    $project = collaborativeProject(User::factory()->create(), 'Studio');

    $editor = signedIn();
    accept(linkTo($project, ShareRole::Editor))->assertOk();

    $this->postJson("/api/projects/{$project->id}/duplicate")->assertCreated();

    expect(Project::query()->where('name', 'Studio (copy)')->sole()->user_id)
        ->toBe($editor->getKey());
});

it('refuses to duplicate for somebody who may only look', function (): void {
    $project = collaborativeProject(User::factory()->create());

    signedIn();
    accept(linkTo($project, ShareRole::Commenter))->assertOk();

    $this->postJson("/api/projects/{$project->id}/duplicate")->assertForbidden();
});
