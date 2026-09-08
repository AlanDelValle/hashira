<?php

declare(strict_types=1);

use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Organisations\Notifications\InvitedToOrganisation;
use App\Domain\Organisations\OrganisationRole;
use App\Models\User;
use Illuminate\Support\Facades\Notification;

/*
 * Phase 10.2b. Inviting somebody, and everything that has to be true about a firm's people:
 * that being in one is agreed to rather than done to you, that an invitation admits the person
 * it was addressed to and nobody else, and that a firm always has somebody who can administer
 * it.
 */

it('sends an invitation rather than putting somebody in', function (): void {
    Notification::fake();

    $admin = signedIn();
    $organisation = firm($admin);

    $this->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'Ana@Example.com',
        'role' => 'member',
    ])
        ->assertCreated()
        ->assertJsonPath('data.email', 'ana@example.com')
        ->assertJsonPath('data.role', 'member');

    expect($organisation->members()->count())->toBe(1);

    Notification::assertSentOnDemand(
        InvitedToOrganisation::class,
        fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'ana@example.com',
    );
});

it('keeps inviting to the firm\'s admins', function (): void {
    Notification::fake();

    $admin = User::factory()->create();
    $organisation = firm($admin);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com',
        'role' => 'member',
    ])->assertForbidden();

    Notification::assertNothingSent();
});

/*
 * Clicking invite again is what somebody does when the first email never arrived. A second row
 * would only be a second thing to revoke — and the token is replaced, because the usual reason
 * to reissue is that the first link went somewhere it should not have.
 */
it('renews an open invitation rather than making a second', function (): void {
    Notification::fake();

    $admin = signedIn();
    $organisation = firm($admin);

    $this->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertCreated();

    $first = OrganisationInvitation::query()->sole();

    $this->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'admin',
    ])->assertCreated();

    $second = OrganisationInvitation::query()->sole();

    expect($second->id)->toBe($first->id)
        ->and($second->token)->not->toBe($first->token)
        ->and($second->role)->toBe(OrganisationRole::Admin);
});

it('refuses to invite somebody who is already here', function (): void {
    Notification::fake();

    $admin = signedIn();
    $organisation = firm($admin);

    $this->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => $admin->email,
        'role' => 'member',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('lets the person it was written to accept it', function (): void {
    Notification::fake();

    $admin = User::factory()->create();
    $organisation = firm($admin, 'Atelier');

    $this->actingAs($admin)->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertCreated();

    $invitation = OrganisationInvitation::query()->sole();
    $ana = signedIn(User::factory()->create(['email' => 'ana@example.com']));

    $this->getJson('/api/invitations')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.organisationName', 'Atelier');

    $this->postJson("/api/invitations/{$invitation->token}/accept")
        ->assertOk()
        ->assertJsonPath('data.name', 'Atelier')
        ->assertJsonPath('data.role', 'member');

    expect($organisation->fresh()->roleFor($ana))->toBe(OrganisationRole::Member)
        ->and($invitation->fresh()->accepted_at)->not->toBeNull();
});

/*
 * The token is not the whole of it. An invitation is addressed, so forwarding the email admits
 * the person it was written to and nobody else.
 */
it('will not let a forwarded invitation admit somebody else', function (): void {
    Notification::fake();

    $admin = User::factory()->create();
    $organisation = firm($admin);

    $this->actingAs($admin)->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertCreated();

    $invitation = OrganisationInvitation::query()->sole();

    signedIn(User::factory()->create(['email' => 'someone.else@example.com']));

    $this->getJson('/api/invitations')->assertOk()->assertJsonCount(0, 'data');
    $this->postJson("/api/invitations/{$invitation->token}/accept")->assertNotFound();

    expect($organisation->fresh()->members()->count())->toBe(1);
});

it('will not accept an invitation that was withdrawn or has expired', function (): void {
    Notification::fake();

    $admin = User::factory()->create();
    $organisation = firm($admin);
    $ana = User::factory()->create(['email' => 'ana@example.com']);

    $this->actingAs($admin)->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertCreated();

    $invitation = OrganisationInvitation::query()->sole();

    $this->actingAs($admin)
        ->deleteJson("/api/organisations/{$organisation->id}/invitations/{$invitation->id}")
        ->assertNoContent();

    signedIn($ana);
    $this->postJson("/api/invitations/{$invitation->token}/accept")->assertNotFound();

    // Set rather than mass assigned: nothing on this model is fillable, because it is where a
    // stray attribute would hand out a firm.
    $invitation->revoked_at = null;
    $invitation->expires_at = now()->subDay();
    $invitation->save();

    $this->postJson("/api/invitations/{$invitation->token}/accept")->assertNotFound();

    expect($organisation->fresh()->members()->count())->toBe(1);
});

it('never lowers a role somebody already holds', function (): void {
    Notification::fake();

    $founder = User::factory()->create();
    $organisation = firm($founder);

    $ana = User::factory()->create(['email' => 'ana@example.com']);
    joinsFirm($organisation, $ana, OrganisationRole::Admin);

    $this->actingAs($founder)->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertUnprocessable();

    // Directly, since inviting somebody already here is refused above: an invitation written
    // before they joined by another route is the case this defends.
    $invitation = new OrganisationInvitation;
    $invitation->organisation_id = $organisation->id;
    $invitation->email = 'ana@example.com';
    $invitation->role = OrganisationRole::Member;
    $invitation->token = str_repeat('a', 43);
    $invitation->save();

    signedIn($ana);
    $this->postJson("/api/invitations/{$invitation->token}/accept")->assertOk();

    expect($organisation->fresh()->roleFor($ana))->toBe(OrganisationRole::Admin);
});

it('lets somebody say no, and stops offering it', function (): void {
    Notification::fake();

    $admin = User::factory()->create();
    $organisation = firm($admin);

    $this->actingAs($admin)->postJson("/api/organisations/{$organisation->id}/invitations", [
        'email' => 'ana@example.com', 'role' => 'member',
    ])->assertCreated();

    $invitation = OrganisationInvitation::query()->sole();

    signedIn(User::factory()->create(['email' => 'ana@example.com']));

    $this->postJson("/api/invitations/{$invitation->token}/decline")->assertNoContent();
    $this->getJson('/api/invitations')->assertOk()->assertJsonCount(0, 'data');

    expect($organisation->fresh()->members()->count())->toBe(1);
});

/*
 * The invariant every one of these defends. A firm with no admin can still be worked in and can
 * never be administered again — nobody can invite, rename or delete it — and the interface
 * offers no way out of that, so it is refused at every door leading to it.
 */
it('refuses to leave the firm without an admin', function (): void {
    $founder = signedIn();
    $organisation = firm($founder);

    $member = $organisation->fresh()->membershipFor($founder);

    $this->patchJson("/api/organisations/{$organisation->id}/members/{$member->id}", [
        'role' => 'member',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    $this->deleteJson("/api/organisations/{$organisation->id}/members/{$member->id}")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('member');

    expect($organisation->fresh()->roleFor($founder))->toBe(OrganisationRole::Admin);
});

it('lets the last admin go once somebody else can administer', function (): void {
    $founder = signedIn();
    $organisation = firm($founder);

    $colleague = User::factory()->create();
    joinsFirm($organisation, $colleague, OrganisationRole::Member);

    $theirs = $organisation->fresh()->membershipFor($colleague);

    $this->patchJson("/api/organisations/{$organisation->id}/members/{$theirs->id}", [
        'role' => 'admin',
    ])->assertOk()->assertJsonPath('data.role', 'admin');

    $mine = $organisation->fresh()->membershipFor($founder);

    $this->deleteJson("/api/organisations/{$organisation->id}/members/{$mine->id}")
        ->assertNoContent();

    expect($organisation->fresh()->roleFor($founder))->toBeNull();
});

it('lets a member leave without asking, and an admin show somebody out', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $mine = $organisation->fresh()->membershipFor($employee);

    $this->deleteJson("/api/organisations/{$organisation->id}/members/{$mine->id}")
        ->assertNoContent();

    expect($organisation->fresh()->roleFor($employee))->toBeNull();

    $again = User::factory()->create();
    joinsFirm($organisation, $again, OrganisationRole::Member);
    $theirs = $organisation->fresh()->membershipFor($again);

    signedIn($admin);

    $this->deleteJson("/api/organisations/{$organisation->id}/members/{$theirs->id}")
        ->assertNoContent();

    expect(OrganisationMember::query()->count())->toBe(1);
});

it('shows the member list to anybody in the firm, and to nobody else', function (): void {
    $admin = User::factory()->create();
    $organisation = firm($admin);

    $employee = signedIn();
    joinsFirm($organisation, $employee, OrganisationRole::Member);

    $this->getJson("/api/organisations/{$organisation->id}/members")
        ->assertOk()
        ->assertJsonCount(2, 'data');

    signedIn();

    $this->getJson("/api/organisations/{$organisation->id}/members")->assertNotFound();
});
