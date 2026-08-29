<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Documents\Models\Document;
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
        return [
            'id' => $this->id,
            'projectId' => $this->project_id,
            'name' => $this->name,
            'schemaVersion' => $this->schema_version,
            'revision' => $this->revision,
            'drawing' => $this->data,
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
