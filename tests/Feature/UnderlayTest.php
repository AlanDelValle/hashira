<?php

declare(strict_types=1);

use App\Domain\Projects\Models\Project;
use App\Domain\Underlays\Models\Underlay;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function pagePicture(): UploadedFile
{
    // A one-pixel PNG is a real PNG, which is all the endpoint is asked to believe.
    return UploadedFile::fake()->image('page.png', 8, 8);
}

it('takes a rasterised page and keeps it off the public disk', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $response = $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.name', 'Survey.pdf')
        ->assertJsonPath('data.width', 841);

    $underlay = Underlay::query()->sole();

    expect($underlay->project_id)->toBe($project->id)
        ->and($underlay->path)->toStartWith("underlays/{$project->id}/");

    Storage::disk()->assertExists($underlay->path);
});

it('serves the picture to the owner and to nobody else', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $id = $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ])->json('data.id');

    $this->get("/api/projects/{$project->id}/underlays/{$id}/image")
        ->assertOk()
        ->assertHeader('content-type', 'image/png');

    $this->post('/api/logout');
    $this->actingAs(User::factory()->create());

    $this->getJson("/api/projects/{$project->id}/underlays/{$id}/image")->assertNotFound();
});

it('is not part of what a share link hands out', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ])->assertCreated();

    $url = $this->postJson("/api/projects/{$project->id}/share")->json('data.url');

    // Signed out, holding the link: the drawing comes back, and nothing about the survey it
    // was traced from.
    $this->post('/api/logout');

    $response = $this->getJson('/api/share/'.basename((string) $url));

    expect($response->json('data'))->not->toHaveKey('underlays');
});

it('refuses anything that is not a page picture', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => UploadedFile::fake()->create('survey.pdf', 20, 'application/pdf'),
    ])->assertStatus(422)->assertJsonValidationErrors('image');
});

it('throws the picture away with the underlay', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $id = $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ])->json('data.id');

    $path = Underlay::query()->sole()->path;

    $this->deleteJson("/api/projects/{$project->id}/underlays/{$id}")->assertNoContent();

    expect(Underlay::query()->count())->toBe(0);
    Storage::disk()->assertMissing($path);
});

it('takes the pictures with the project when the project goes', function (): void {
    Storage::fake();

    $owner = signedIn();
    $project = Project::factory()->for($owner, 'owner')->create();

    $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ])->assertCreated();

    $path = Underlay::query()->sole()->path;

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    // The rows cascade by themselves; a database cascade has never deleted a file.
    Storage::disk()->assertMissing($path);
});

it('will not let somebody else import into a project', function (): void {
    Storage::fake();

    $project = Project::factory()->create();
    signedIn();

    $this->post("/api/projects/{$project->id}/underlays", [
        'name' => 'Survey.pdf',
        'page' => 1,
        'width' => 841,
        'height' => 594,
        'image' => pagePicture(),
    ])->assertNotFound();
});
