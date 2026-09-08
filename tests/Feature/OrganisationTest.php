<?php

declare(strict_types=1);

use App\Domain\Organisations\Actions\CreateOrganisation;
use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Organisations\OrganisationRole;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\Actions\IssueShareLink;
use App\Domain\Sharing\ShareRole;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/*
 * Phase 10.2a. A project's owner becomes one of two things, and being in a firm becomes the
 * third way to reach a drawing — after owning it and after taking up a link.
 */

function firm(User $founder, string $name = 'Atelier'): Organisation
{
    return app(CreateOrganisation::class)->handle($founder, $name);
}

function joinsFirm(Organisation $organisation, User $user, OrganisationRole $role): void
{
    $member = new OrganisationMember;
    $member->organisation_id = $organisation->id;
    $member->user_id = (int) $user->getKey();
    $member->role = $role;
    $member->joined_at = now();
    $member->save();
}

function firmProject(Organisation $organisation, User $creator, string $name = 'Housing'): Project
{
    return app(CreateProject::class)->handle($creator, $name, null, $organisation);
}

it('makes whoever starts a firm its admin', function (): void {
    $founder = signedIn();

    $this->postJson('/api/organisations', ['name' => 'Atelier'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Atelier')
        ->assertJsonPath('data.role', 'admin');

    expect(OrganisationMember::query()->sole()->role)->toBe(OrganisationRole::Admin);
});

/*
 * An organisation nobody is in is a row nothing can reach — not even whoever made it, since
 * `created_by` is kept for the record and no policy consults it.
 */
it('never leaves an organisation with nobody in it', function (): void {
    $founder = User::factory()->create();

    $organisation = firm($founder);

    expect($organisation->roleFor($founder))->toBe(OrganisationRole::Admin);
});

it('gives a project one owner and never two', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);

    $mine = app(CreateProject::class)->handle($founder, 'Mine');
    $theirs = firmProject($organisation, $founder);

    expect($mine->user_id)->not->toBeNull()
        ->and($mine->organisation_id)->toBeNull()
        ->and($theirs->organisation_id)->toBe($organisation->id)
        ->and($theirs->user_id)->toBeNull();
});

/*
 * The check constraint, not the model. Everything above it can be careful and still be wrong
 * one bad insert later; this is the thing that makes "one of two" true rather than intended.
 */
it('refuses in the database a project owned by both', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);

    expect(fn () => DB::table('projects')->insert([
        'id' => (string) Str::ulid(),
        'user_id' => $founder->getKey(),
        'organisation_id' => $organisation->id,
        'name' => 'Impossible',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('refuses in the database a project owned by nobody', function (): void {
    expect(fn () => DB::table('projects')->insert([
        'id' => (string) Str::ulid(),
        'user_id' => null,
        'organisation_id' => null,
        'name' => 'Orphan',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('lets somebody in the firm open and change its drawings', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    $project = firmProject($organisation, $founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.role', 'editor');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => ['type' => 'addElements', 'label' => 'Wall', 'elements' => []],
        'origin' => 'browser-a',
    ])->assertCreated();
});

/*
 * What a member may not do. Deleting and sharing are an owner's acts, and for a firm's drawing
 * the owner is whoever administers the firm.
 */
it('keeps deleting and sharing to the firm\'s admins', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    $project = firmProject($organisation, $founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->deleteJson("/api/projects/{$project->id}")->assertForbidden();
    $this->postJson("/api/projects/{$project->id}/share")->assertForbidden();

    signedIn($founder);

    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();
});

it('shows a stranger nothing, not even that it exists', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    $project = firmProject($organisation, $founder);

    signedIn();

    $this->getJson("/api/projects/{$project->id}/document")->assertNotFound();
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(0, 'data');
});

it('lists the firm\'s drawings beside your own', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    firmProject($organisation, $founder, 'Housing');

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);
    app(CreateProject::class)->handle($employee, 'My own');

    $response = $this->getJson('/api/projects')->assertOk()->assertJsonCount(2, 'data');

    $names = collect($response->json('data'))->pluck('name')->sort()->values()->all();

    expect($names)->toBe(['Housing', 'My own']);
});

it('says whose drawing it is when it is the firm\'s', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder, 'Estúdio Sul');
    firmProject($organisation, $founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonPath('data.0.ownerName', 'Estúdio Sul')
        ->assertJsonPath('data.0.role', 'editor');
});

it('lets a member start a project the firm owns', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->postJson('/api/projects', [
        'name' => 'Competition',
        'organisationId' => $organisation->id,
    ])->assertCreated();

    expect(Project::query()->sole()->organisation_id)->toBe($organisation->id);
});

it('will not start a project in a firm you are not in', function (): void {
    $organisation = firm(User::factory()->create());

    signedIn();

    $this->postJson('/api/projects', [
        'name' => 'Trespass',
        'organisationId' => $organisation->id,
    ])->assertNotFound();

    expect(Project::query()->count())->toBe(0);
});

/*
 * The bug this sub-phase would have shipped. A row on the project overrides the organisation,
 * so a commenter link taken up by somebody who is already an editor through the firm would
 * have written a row that narrowed them. Accepting a link has never taken access away.
 */
it('does not let a weaker link narrow somebody the firm already admitted', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    $project = firmProject($organisation, $founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $link = app(IssueShareLink::class)->handle($project, $founder, role: ShareRole::Commenter);

    $this->postJson("/api/share/{$link->token}/accept")->assertOk();

    expect($project->fresh()->effectiveRole($employee))->toBe(ShareRole::Editor)
        ->and($project->fresh()->memberRole($employee))->toBeNull();
});

it('renames and deletes only for an admin, and takes the drawings with it', function (): void {
    $founder = User::factory()->create();
    $organisation = firm($founder);
    firmProject($organisation, $founder);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->putJson("/api/organisations/{$organisation->id}", ['name' => 'Nope'])
        ->assertForbidden();
    $this->deleteJson("/api/organisations/{$organisation->id}")->assertForbidden();

    signedIn($founder);

    $this->putJson("/api/organisations/{$organisation->id}", ['name' => 'Atelier Norte'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Atelier Norte');

    $this->deleteJson("/api/organisations/{$organisation->id}")->assertNoContent();

    expect(Project::query()->count())->toBe(0);
});

it('lists only the firms you are in', function (): void {
    firm(User::factory()->create(), 'Somebody else');

    $mine = signedIn();
    firm($mine, 'Mine');

    $this->getJson('/api/organisations')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Mine');
});
