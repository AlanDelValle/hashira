<?php

declare(strict_types=1);

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\ShareRole;
use App\Models\User;

/*
 * The picture of a drawing that the projects list shows. Made by the editor out of the same
 * scene every export comes from, written on its own route, and served as an image so that a
 * list of forty of them is forty things the browser already knows how to lazy load.
 */

/** A real PNG, base64'd — which is exactly what the editor sends. */
function drawingPicture(): string
{
    $image = imagecreatetruecolor(320, 200);

    ob_start();
    imagepng($image);
    $png = (string) ob_get_clean();
    imagedestroy($image);

    return base64_encode($png);
}

function withDrawing(User $owner, string $name = 'Studio'): Project
{
    return app(CreateProject::class)->handle($owner, $name);
}

function admitted(Project $project, User $user, ShareRole $role): void
{
    $membership = new ProjectMember;
    $membership->project_id = $project->id;
    $membership->user_id = (int) $user->getKey();
    $membership->role = $role;
    $membership->joined_at = now();
    $membership->save();
}

it('keeps the picture the editor sent and hands it back as an image', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner);

    $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
        ->assertNoContent();

    $response = $this->get("/api/projects/{$project->id}/preview");

    $response->assertOk()
        ->assertHeader('Content-Type', 'image/png')
        ->assertHeader('Cache-Control', 'no-cache, private');

    expect($response->headers->get('ETag'))->not->toBeNull();
});

it('says a drawing nobody has photographed has no picture', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner);

    $this->get("/api/projects/{$project->id}/preview")->assertNotFound();
});

/*
 * The list orders by when the drawing was last worked on. Merely opening one to look at it
 * must not send it to the top, which is the opposite of what a picture of it is for.
 */
it('does not count as working on the drawing', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner);
    $document = $project->document;
    $drawingTouched = $document?->updated_at?->toIso8601String();
    $projectTouched = $project->updated_at->toIso8601String();

    $this->travel(1)->hours();

    $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
        ->assertNoContent();

    expect($document?->refresh()->updated_at?->toIso8601String())->toBe($drawingTouched)
        ->and($project->refresh()->updated_at->toIso8601String())->toBe($projectTouched);
});

it('tells the list which drawings have one', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner);

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonPath('data.0.drawing.preview', false);

    $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
        ->assertNoContent();

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonPath('data.0.drawing.preview', true);
});

// The same drawing looks the same. A copy with no picture reads as a copy that failed.
it('carries the picture into a duplicate', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner, 'Studio');

    $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
        ->assertNoContent();

    $this->postJson("/api/projects/{$project->id}/duplicate")->assertCreated();

    $copy = Project::query()->where('name', 'Studio (copy)')->sole();

    $this->get("/api/projects/{$copy->id}/preview")->assertOk();
});

/*
 * What comes back out of this column is served with `Content-Type: image/png`, so what goes
 * into it has to be one. The eight bytes every PNG starts with are the whole check.
 */
it('refuses anything that is not a picture, and any picture too large', function (): void {
    $owner = signedIn();
    $project = withDrawing($owner);

    $this->putJson("/api/projects/{$project->id}/preview", [
        'preview' => base64_encode('<svg>not a png</svg>'),
    ])->assertUnprocessable()->assertJsonValidationErrors('preview');

    $this->putJson("/api/projects/{$project->id}/preview", [
        'preview' => 'not base64 at all !!!',
    ])->assertUnprocessable()->assertJsonValidationErrors('preview');

    $this->putJson("/api/projects/{$project->id}/preview", [
        'preview' => base64_encode(str_repeat('x', 200_000)),
    ])->assertUnprocessable()->assertJsonValidationErrors('preview');
});

describe('who decides what a drawing looks like in a list', function (): void {
    it('lets an editor write it', function (): void {
        $owner = User::factory()->create();
        $project = withDrawing($owner);
        $editor = signedIn(User::factory()->create());

        admitted($project, $editor, ShareRole::Editor);

        $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
            ->assertNoContent();
    });

    /*
     * A commenter looks at a drawing on the review surface. Deciding what it looks like in
     * somebody else's list is not part of looking at it.
     */
    it('refuses a commenter, who may still see it', function (): void {
        $owner = User::factory()->create();
        $project = withDrawing($owner);
        $commenter = signedIn(User::factory()->create());

        admitted($project, $commenter, ShareRole::Commenter);

        $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
            ->assertForbidden();

        $this->get("/api/projects/{$project->id}/preview")->assertNotFound();
    });

    it('tells a stranger nothing', function (): void {
        $project = Project::factory()->create();
        $project->documents()->create([
            'name' => 'Plan',
            'schema_version' => DocumentSchema::CURRENT_VERSION,
            'data' => DocumentSchema::blank('Plan'),
        ]);

        signedIn(User::factory()->create());

        $this->get("/api/projects/{$project->id}/preview")->assertNotFound();
        $this->putJson("/api/projects/{$project->id}/preview", ['preview' => drawingPicture()])
            ->assertNotFound();
    });
});
