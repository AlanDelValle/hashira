<?php

declare(strict_types=1);

use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\Actions\IssueShareLink;
use App\Domain\Sharing\Models\ShareLink;
use App\Models\User;

function sharedProject(User $owner): Project
{
    return app(CreateProject::class)->handle($owner, 'Studio');
}

it('issues a read-only link the owner can copy', function (): void {
    $owner = signedIn();
    $project = sharedProject($owner);

    $this->postJson("/api/projects/{$project->id}/share")
        ->assertCreated()
        ->assertJsonPath('data.role', 'viewer');

    expect(ShareLink::query()->sole()->token)->toHaveLength(43);
});

it('replaces the previous link when a new one is issued', function (): void {
    $owner = signedIn();
    $project = sharedProject($owner);

    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();
    $first = ShareLink::query()->sole()->token;

    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();

    expect(ShareLink::query()->where('token', $first)->sole()->revoked_at)->not->toBeNull()
        ->and(ShareLink::query()->whereNull('revoked_at')->count())->toBe(1);

    $this->getJson("/api/share/{$first}")->assertNotFound();
});

it('serves the drawing anonymously, and nothing else about it', function (): void {
    $owner = User::factory()->create();
    $project = sharedProject($owner);

    $token = app(IssueShareLink::class)->handle($project, $owner)->token;

    $response = $this->getJson("/api/share/{$token}")->assertOk();

    $payload = $response->json('data');

    expect($payload)->toHaveKeys(['name', 'schemaVersion', 'drawing', 'updatedAt'])
        ->and($payload)->not->toHaveKey('id')
        ->and($payload)->not->toHaveKey('projectId')
        ->and($payload)->not->toHaveKey('revision');
});

it('counts views on the link', function (): void {
    $owner = User::factory()->create();
    $project = sharedProject($owner);
    $link = app(IssueShareLink::class)->handle($project, $owner);

    $this->getJson("/api/share/{$link->token}")->assertOk();
    $this->getJson("/api/share/{$link->token}")->assertOk();

    expect($link->refresh()->view_count)->toBe(2)
        ->and($link->last_viewed_at)->not->toBeNull();
});

/*
 * Unknown, revoked and expired are three different reasons, and a caller must not be able to
 * tell them apart. They are three tests so that a regression names which one broke.
 */

it('answers 404 for a token that never existed', function (): void {
    $this->getJson('/api/share/'.str_repeat('a', 43))->assertNotFound();
});

it('answers 404 for a revoked token', function (): void {
    $owner = User::factory()->create();
    $link = app(IssueShareLink::class)->handle(sharedProject($owner), $owner);

    $link->forceFill(['revoked_at' => now()])->save();

    $this->getJson("/api/share/{$link->token}")->assertNotFound();
});

it('reads an expiry back as the instant it was given', function (): void {
    $owner = User::factory()->create();
    $expiresAt = now()->addHour();

    $link = app(IssueShareLink::class)->handle(sharedProject($owner), $owner, $expiresAt);

    /*
     * Regression guard for the connection time zone. `timestamptz` interprets a naive value
     * using the session zone, so a connection left on the server's locale shifts every write
     * by its offset — enough to keep an expired link alive for hours.
     */
    expect($link->fresh()->expires_at?->diffInSeconds($expiresAt, absolute: true))
        ->toBeLessThan(2);

    $this->getJson("/api/share/{$link->token}")->assertOk();
});

it('answers 404 for an expired token', function (): void {
    $owner = User::factory()->create();
    $link = app(IssueShareLink::class)->handle(sharedProject($owner), $owner);

    $link->forceFill(['expires_at' => now()->subMinute()])->save();

    $this->getJson("/api/share/{$link->token}")->assertNotFound();
});

it('revokes on request', function (): void {
    $owner = signedIn();
    $project = sharedProject($owner);

    $this->postJson("/api/projects/{$project->id}/share")->assertCreated();
    $token = ShareLink::query()->sole()->token;

    $this->deleteJson("/api/projects/{$project->id}/share")->assertNoContent();

    $this->getJson("/api/share/{$token}")->assertNotFound();
    $this->getJson("/api/projects/{$project->id}/share")->assertOk()->assertJsonPath('data', null);
});
