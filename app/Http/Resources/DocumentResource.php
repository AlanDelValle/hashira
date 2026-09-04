<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Blocks\ReferencedBlocks;
use App\Domain\Documents\Models\Document;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The drawing is exposed as `drawing`, not `data`: Laravel skips its own `data` wrapper for
 * any resource whose payload already has that key, which would leave this one endpoint
 * shaped differently from every other.
 *
 * @mixin Document
 */
final class DocumentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var User|null $user */
        $user = $request->user();

        return [
            'id' => $this->id,
            'projectId' => $this->project_id,
            'name' => $this->name,
            'schemaVersion' => $this->schema_version,
            'revision' => $this->revision,
            'drawing' => $this->data,
            // The blocks this drawing refers to, since it stores their ids and not their
            // geometry. See App\Domain\Blocks\ReferencedBlocks.
            'blocks' => BlockResource::collection(
                ReferencedBlocks::of($this->data, $this->project),
            ),
            /*
             * What the reader holds in the project this drawing belongs to. The editor asks
             * before it opens: a member who may look but not change is told so, rather than
             * handed a full editor whose every save is refused.
             */
            'role' => $user === null ? null : ($this->project->isOwnedBy($user)
                ? 'owner'
                : $this->project->memberRole($user)?->value),
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
