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

it('answers 404 for unknown, revoked and expired tokens alike', function (): void {
    $owner = User::factory()->create();
    $project = sharedProject($owner);
    $issue = app(IssueShareLink::class);

    $this->getJson('/api/share/'.str_repeat('a', 43))->assertNotFound();

    $revoked = $issue->handle($project, $owner);
    $revoked->forceFill(['revoked_at' => now()])->save();
    $this->getJson("/api/share/{$revoked->token}")->assertNotFound();

    $expired = $issue->handle($project, $owner);
    $expired->forceFill(['expires_at' => now()->subMinute()])->save();
    $this->getJson("/api/share/{$expired->token}")->assertNotFound();
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
