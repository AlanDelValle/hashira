<?php

declare(strict_types=1);

use App\Domain\Organisations\OrganisationRole;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\Actions\IssueShareLink;
use App\Domain\Sharing\ShareRole;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/*
 * Phase 10.2c. The exception to what 10.2a decided: what a firm draws belongs to the firm and
 * everybody in it can open it — except the competition entry, and the client nobody junior is
 * on. Restriction takes the default away; the row `project_members` has held since 9.4 is then
 * the only way in.
 */

it('hides a restricted drawing from the rest of the firm', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin, 'Competition');

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data');

    $this->actingAs($admin)
        ->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertOk()
        ->assertJsonPath('data.restricted', true);

    signedIn($employee);

    $this->getJson('/api/projects')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson("/api/projects/{$project->id}/document")->assertNotFound();
});

/*
 * An admin has to keep reaching it. A project its own firm's admins could not open would be a
 * project nobody could un-restrict, and there is no way back from that.
 */
it('keeps a restricted drawing reachable by the firm\'s admins', function (): void {
    $admin = signedIn();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin, 'Competition');

    $this->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertOk();

    $this->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.role', 'owner');
});

it('lets a named colleague in, and only them', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin, 'Competition');

    $named = User::factory()->create();
    $other = User::factory()->create();
    joinsFirm($organisation, $named, OrganisationRole::Member);
    joinsFirm($organisation, $other, OrganisationRole::Member);

    $this->actingAs($admin)
        ->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertOk();

    $this->actingAs($admin)
        ->postJson("/api/projects/{$project->id}/members", [
            'userId' => $named->getKey(),
            'role' => 'editor',
        ])
        ->assertCreated()
        ->assertJsonPath('data.role', 'editor');

    signedIn($named);
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.role', 'editor');

    signedIn($other);
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(0, 'data');
});

/*
 * The other direction, on a project nobody restricted: a row narrows what the firm grants,
 * because a row on the project always wins.
 */
it('narrows somebody the firm would otherwise let edit', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin);

    $employee = User::factory()->create();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->actingAs($admin)
        ->postJson("/api/projects/{$project->id}/members", [
            'userId' => $employee->getKey(),
            'role' => 'commenter',
        ])
        ->assertCreated();

    signedIn($employee);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.role', 'commenter');

    $this->postJson("/api/projects/{$project->id}/operations", [
        'envelope' => ['type' => 'addElements', 'label' => 'Wall', 'elements' => []],
        'origin' => 'browser-a',
    ])->assertForbidden();
});

/*
 * Naming somebody admits colleagues and never strangers. A second way to hand access to an
 * arbitrary account would be a way around the invitation this phase just built.
 */
it('refuses to name somebody who is not in the firm', function (): void {
    $admin = signedIn();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin);

    $stranger = User::factory()->create();

    $this->postJson("/api/projects/{$project->id}/members", [
        'userId' => $stranger->getKey(),
        'role' => 'editor',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('userId');

    expect(ProjectMember::query()->count())->toBe(0);
});

it('will not restrict a drawing that is somebody\'s own', function (): void {
    $owner = signedIn();
    $project = app(CreateProject::class)->handle($owner, 'Mine');

    $this->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('restricted');

    expect($project->fresh()->restricted_at)->toBeNull();
});

it('refuses that in the database too', function (): void {
    $owner = User::factory()->create();

    expect(fn () => DB::table('projects')->insert([
        'id' => (string) Str::ulid(),
        'user_id' => $owner->getKey(),
        'name' => 'Impossible',
        'restricted_at' => now(),
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('keeps restricting to whoever administers the project', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertForbidden();

    $this->postJson("/api/projects/{$project->id}/members", [
        'userId' => $employee->getKey(),
        'role' => 'editor',
    ])->assertForbidden();
});

it('gives the firm its drawing back when the restriction is lifted', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin);

    $employee = User::factory()->create();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->actingAs($admin)
        ->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertOk();

    signedIn($employee);
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(0, 'data');

    $this->actingAs($admin)
        ->putJson("/api/projects/{$project->id}/restriction", ['restricted' => false])
        ->assertOk()
        ->assertJsonPath('data.restricted', false);

    signedIn($employee);
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data');
});

/*
 * A share link still works on a restricted drawing, and should: restriction withholds the
 * firm's default, not the owner's ability to hand the drawing to a consultant.
 */
it('still lets a link admit somebody to a restricted drawing', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);
    $project = firmProject($organisation, $admin);

    $this->actingAs($admin)
        ->putJson("/api/projects/{$project->id}/restriction", ['restricted' => true])
        ->assertOk();

    $link = app(IssueShareLink::class)->handle($project, $admin, role: ShareRole::Editor);

    $consultant = signedIn();

    $this->postJson("/api/share/{$link->token}/accept")->assertOk();

    expect($project->fresh()->effectiveRole($consultant))->toBe(ShareRole::Editor);
});
