<?php

declare(strict_types=1);

use App\Domain\Blocks\Models\Block;
use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\ShareRole;
use App\Models\User;

/** @return array<string, mixed> */
function blockPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Desk',
        'category' => 'tables',
        'width' => 1400,
        'height' => 700,
        'draw' => [
            ['kind' => 'rect', 'x' => 0, 'y' => 0, 'w' => 1, 'h' => 1],
            ['kind' => 'line', 'x1' => 0, 'y1' => 0.7, 'x2' => 1, 'y2' => 0.7],
        ],
    ], $overrides);
}

function makeBlock(User $owner, string $name = 'Desk'): Block
{
    $block = new Block;
    $block->user_id = (int) $owner->getKey();
    $block->name = $name;
    $block->category = 'tables';
    $block->width = 1400;
    $block->height = 700;
    $block->draw = [['kind' => 'rect', 'x' => 0, 'y' => 0, 'w' => 1, 'h' => 1]];
    $block->save();

    return $block;
}

it('saves a block somebody drew', function (): void {
    signedIn();

    $this->postJson('/api/blocks', blockPayload())
        ->assertCreated()
        ->assertJsonPath('data.name', 'Desk')
        ->assertJsonPath('data.width', 1400)
        ->assertJsonCount(2, 'data.draw');

    expect(Block::query()->sole()->category)->toBe('tables');
});

it('lists only the blocks belonging to the caller', function (): void {
    $owner = signedIn();

    makeBlock($owner, 'Mine');
    makeBlock(User::factory()->create(), 'Someone else’s');

    $this->getJson('/api/blocks')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Mine');
});

it('refuses a block with nothing drawn on it', function (): void {
    signedIn();

    $this->postJson('/api/blocks', blockPayload(['draw' => []]))
        ->assertStatus(422)
        ->assertJsonValidationErrors('draw');
});

it('refuses a shape it would not know how to draw', function (): void {
    signedIn();

    $this->postJson('/api/blocks', blockPayload(['draw' => [['kind' => 'script']]]))
        ->assertStatus(422)
        ->assertJsonValidationErrors('draw');
});

it('refuses a category the library does not have', function (): void {
    signedIn();

    $this->postJson('/api/blocks', blockPayload(['category' => 'vehicles']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('category');
});

it('deletes a block, and will not delete somebody else’s', function (): void {
    $owner = signedIn();
    $mine = makeBlock($owner);
    $theirs = makeBlock(User::factory()->create());

    $this->deleteJson("/api/blocks/{$mine->id}")->assertNoContent();
    $this->deleteJson("/api/blocks/{$theirs->id}")->assertNotFound();

    expect(Block::query()->pluck('id')->all())->toBe([$theirs->id]);
});

it('serves a drawing together with the blocks it refers to', function (): void {
    $owner = signedIn();
    $block = makeBlock($owner);
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Office']);

    $data = DocumentSchema::blank('Office');
    $data['elements'] = [[
        'id' => 'el_desk',
        'type' => 'asset',
        'layerId' => 'layer_furniture',
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        'geometry' => ['assetId' => $block->id, 'width' => 1400, 'height' => 700, 'mirrored' => false],
    ]];

    $project->documents()->create([
        'name' => 'Office',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => $data,
    ]);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonCount(1, 'data.blocks')
        ->assertJsonPath('data.blocks.0.id', $block->id);
});

it('sends a shared drawing the blocks it needs, and nothing about who made them', function (): void {
    $owner = signedIn();
    $block = makeBlock($owner);
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Office']);

    $data = DocumentSchema::blank('Office');
    $data['elements'] = [[
        'id' => 'el_desk',
        'type' => 'asset',
        'layerId' => 'layer_furniture',
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        'geometry' => ['assetId' => $block->id, 'width' => 1400, 'height' => 700, 'mirrored' => false],
    ]];

    $project->documents()->create([
        'name' => 'Office',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => $data,
    ]);

    $url = $this->postJson("/api/projects/{$project->id}/share")->json('data.url');
    $token = basename((string) $url);

    $response = $this->getJson("/api/share/{$token}")->assertOk();

    expect($response->json('data.blocks'))->toHaveCount(1)
        ->and($response->json('data.blocks.0.name'))->toBe('Desk')
        ->and($response->json('data.blocks.0'))->not->toHaveKey('userId');
});

it('does not hand out a block that belongs to somebody else’s library', function (): void {
    $owner = signedIn();
    $theirs = makeBlock(User::factory()->create());
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Office']);

    $data = DocumentSchema::blank('Office');
    $data['elements'] = [[
        'id' => 'el_desk',
        'type' => 'asset',
        'layerId' => 'layer_furniture',
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        'geometry' => ['assetId' => $theirs->id, 'width' => 1400, 'height' => 700, 'mirrored' => false],
    ]];

    $project->documents()->create([
        'name' => 'Office',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => $data,
    ]);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonCount(0, 'data.blocks');
});

/*
 * A block belongs to a person, so "whose library" became a real question the moment a project
 * could have more than one person in it. Anybody who may edit could have placed one, and a
 * drawing that resolves differently depending on who opened it is the failure to avoid: the
 * owner would find a dashed footprint where their collaborator had put a desk.
 */
it('hands out a block an editor placed from their own library', function (): void {
    $owner = signedIn();
    $editor = User::factory()->create();
    $theirs = makeBlock($editor, 'Their desk');
    $project = Project::factory()->for($owner, 'owner')->create(['name' => 'Office']);

    $member = new ProjectMember;
    $member->project_id = $project->id;
    $member->user_id = (int) $editor->getKey();
    $member->role = ShareRole::Editor;
    $member->joined_at = now();
    $member->save();

    $data = DocumentSchema::blank('Office');
    $data['elements'] = [[
        'id' => 'el_desk',
        'type' => 'asset',
        'layerId' => 'layer_furniture',
        'transform' => ['x' => 0, 'y' => 0, 'rotation' => 0],
        'geometry' => ['assetId' => $theirs->id, 'width' => 1400, 'height' => 700, 'mirrored' => false],
    ]];

    $project->documents()->create([
        'name' => 'Office',
        'schema_version' => DocumentSchema::CURRENT_VERSION,
        'data' => $data,
    ]);

    $this->getJson("/api/projects/{$project->id}/document")
        ->assertOk()
        ->assertJsonPath('data.blocks.0.name', 'Their desk');
});

it('requires signing in', function (): void {
    $this->getJson('/api/blocks')->assertUnauthorized();
    $this->postJson('/api/blocks', blockPayload())->assertUnauthorized();
});
