<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Blocks\ReferencedBlocks;
use App\Domain\Documents\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What an anonymous holder of a share link is allowed to see.
 *
 * Deliberately its own class rather than a variant of DocumentResource: keeping the public
 * shape separate means a field added for the owner's UI cannot leak to the public endpoint
 * by accident. There is no project, no owner, no identifiers and no revision here.
 *
 * @mixin Document
 */
final class SharedDocumentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->name,
            'schemaVersion' => $this->schema_version,
            'drawing' => $this->data,
            // A visitor holding a link has no library of their own, so the blocks the drawing
            // uses travel with it — the definitions only, with nothing about who made them.
            'blocks' => BlockResource::collection(
                ReferencedBlocks::of($this->data, (int) $this->project->user_id),
            ),
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
