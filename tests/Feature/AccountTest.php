<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\OrganisationRole;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\ShareRole;
use App\Domain\Underlays\Models\Underlay;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/*
 * Your own account: the name other people see, the password, and the end of it. No id in any
 * of these routes — the only account they reach is the one asking.
 */

function signedInWith(string $password = 'drafting-table'): User
{
    return signedIn(User::factory()->create(['password' => Hash::make($password)]));
}

describe('the name other people see', function (): void {
    it('changes it', function (): void {
        $user = signedInWith();

        $this->patchJson('/api/user', ['name' => 'Ada Lovelace'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Ada Lovelace');

        expect($user->refresh()->name)->toBe('Ada Lovelace');
    });

    it('refuses a name that is not one', function (): void {
        signedInWith();

        $this->patchJson('/api/user', ['name' => '  '])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    });

    // The address is what an invitation is written to and what a reset is sent to. Changing it
    // is a flow with a message in it, and this is not that flow.
    it('does not let the address be changed on the way past', function (): void {
        $user = signedInWith();
        $address = $user->email;

        $this->patchJson('/api/user', ['name' => 'Ada', 'email' => 'someone@else.test'])
            ->assertOk();

        expect($user->refresh()->email)->toBe($address);
    });

    it('refuses a guest', function (): void {
        $this->patchJson('/api/user', ['name' => 'Nobody'])->assertUnauthorized();
    });
});

describe('changing a password you know', function (): void {
    it('changes it, and the old one stops working', function (): void {
        $user = signedInWith('drafting-table');

        $this->putJson('/api/user/password', [
            'currentPassword' => 'drafting-table',
            'password' => 'a-longer-secret',
            'password_confirmation' => 'a-longer-secret',
        ])->assertNoContent();

        expect(Hash::check('a-longer-secret', $user->refresh()->password))->toBeTrue()
            ->and(Hash::check('drafting-table', $user->password))->toBeFalse();
    });

    /*
     * A session is a thing somebody can walk up to; the password is a thing they have to know.
     * Taking an account from its owner should cost more than a moment alone with their laptop.
     */
    it('refuses without the current password', function (): void {
        $user = signedInWith('drafting-table');

        $this->putJson('/api/user/password', [
            'currentPassword' => 'a guess',
            'password' => 'a-longer-secret',
            'password_confirmation' => 'a-longer-secret',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('currentPassword');

        expect(Hash::check('drafting-table', $user->refresh()->password))->toBeTrue();
    });

    it('refuses a new password that was typed twice and differently', function (): void {
        signedInWith('drafting-table');

        $this->putJson('/api/user/password', [
            'currentPassword' => 'drafting-table',
            'password' => 'a-longer-secret',
            'password_confirmation' => 'a-different-secret',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    });
});

describe('closing the account', function (): void {
    it('takes the account, its drawings, and the session with it', function (): void {
        $user = signedInWith('drafting-table');
        app(CreateProject::class)->handle($user, 'Ground floor');

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('projects', 0);
        $this->assertDatabaseCount('documents', 0);

        // The session outlived the row it pointed at, once.
        $this->getJson('/api/user')->assertUnauthorized();
    });

    /*
     * The account came back from the dead. `SessionGuard::logout()` cycles the remember token
     * of anybody who has one, which saves the user — and Eloquent saves a model whose row is
     * already gone by inserting it, id and all. Signing out has to happen first, and this is
     * the test that says so if anybody ever puts it back.
     */
    it('stays deleted for somebody who ticked “Remember me”', function (): void {
        $user = signedInWith('drafting-table');
        $user->forceFill(['remember_token' => Str::random(60)])->save();

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        expect(User::query()->whereKey($user->getKey())->exists())->toBeFalse();
    });

    it('refuses without the password, and changes nothing', function (): void {
        $user = signedInWith('drafting-table');

        $this->deleteJson('/api/user', ['password' => 'a guess'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        expect(User::query()->whereKey($user->getKey())->exists())->toBeTrue();
    });

    /*
     * A database cascade has never deleted a file. `projects.user_id` cascades, so deleting the
     * row alone would take every project without firing the hook that clears the disk — and
     * somebody else's survey left lying in storage is what that hook exists to prevent.
     */
    it('takes the underlays off the disk rather than leaving them', function (): void {
        Storage::fake();

        $user = signedInWith('drafting-table');
        $project = app(CreateProject::class)->handle($user, 'Traced');

        Storage::put("underlays/{$project->id}/page.png", 'not really a picture');

        $underlay = new Underlay;
        $underlay->project_id = $project->id;
        $underlay->name = 'Survey';
        $underlay->page = 1;
        $underlay->width = 100;
        $underlay->height = 100;
        $underlay->path = "underlays/{$project->id}/page.png";
        $underlay->bytes = 20;
        $underlay->save();

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        Storage::assertMissing("underlays/{$project->id}/page.png");
    });

    /*
     * The invariant 10.2 defends at every door — demoting, removing and leaving all refuse the
     * last admin. Closing the account was a door nobody had built yet.
     */
    it('refuses while a firm would be left without an admin', function (): void {
        $user = signedInWith('drafting-table');
        $organisation = firm($user, 'Ateliê Norte');

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account');

        expect(User::query()->whereKey($user->getKey())->exists())->toBeTrue()
            ->and(Organisation::query()->whereKey($organisation->id)->exists())->toBeTrue();
    });

    it('names every firm that would be stranded', function (): void {
        $user = signedInWith('drafting-table');
        firm($user, 'Ateliê Norte');
        firm($user, 'Estúdio Sul');

        $response = $this->deleteJson('/api/user', ['password' => 'drafting-table'])
            ->assertUnprocessable();

        $said = $response->json('errors.account.0');

        expect($said)->toContain('Ateliê Norte')->toContain('Estúdio Sul');
    });

    it('lets the account go once somebody else can administer the firm', function (): void {
        $user = signedInWith('drafting-table');
        $organisation = firm($user, 'Ateliê Norte');

        $colleague = User::factory()->create();
        joinsFirm($organisation, $colleague, OrganisationRole::Admin);

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        expect(Organisation::query()->whereKey($organisation->id)->exists())->toBeTrue();
    });

    /*
     * What a firm owns was never theirs to take, and a firm they started outlives them:
     * `organisations.created_by` was written to null rather than to cascade.
     */
    it('leaves the firm’s drawings, and the firm, standing', function (): void {
        $founder = User::factory()->create();
        $organisation = firm($founder, 'Ateliê Norte');

        $employee = signedInWith('drafting-table');
        joinsFirm($organisation, $employee, OrganisationRole::Member);

        $theirs = app(CreateProject::class)->handle($employee, 'Rua Aurora', null, $organisation);

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        expect(Project::query()->whereKey($theirs->id)->exists())->toBeTrue()
            ->and(Organisation::query()->whereKey($organisation->id)->exists())->toBeTrue();
    });

    it('leaves somebody else’s drawing alone and keeps the remarks made on it', function (): void {
        $owner = User::factory()->create();
        $project = app(CreateProject::class)->handle($owner, 'Studio');
        $project->documents()->create([
            'name' => 'Studio',
            'schema_version' => DocumentSchema::CURRENT_VERSION,
            'data' => DocumentSchema::blank('Studio'),
        ]);

        $visitor = signedInWith('drafting-table');
        admitted($project, $visitor, ShareRole::Commenter);

        $this->postJson("/api/projects/{$project->id}/comments", [
            'x' => 0,
            'y' => 0,
            'body' => 'This corner is too tight.',
        ])->assertCreated();

        $this->deleteJson('/api/user', ['password' => 'drafting-table'])->assertNoContent();

        expect(Project::query()->whereKey($project->id)->exists())->toBeTrue()
            ->and($project->commentThreads()->count())->toBe(1);

        $this->actingAs($owner)
            ->getJson("/api/projects/{$project->id}/comments")
            ->assertOk()
            ->assertJsonPath('data.0.comments.0.body', 'This corner is too tight.');
    });

    it('refuses a guest', function (): void {
        $this->deleteJson('/api/user', ['password' => 'anything'])->assertUnauthorized();
    });
});
