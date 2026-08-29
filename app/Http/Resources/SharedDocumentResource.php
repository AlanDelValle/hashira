<?php

declare(strict_types=1);

namespace App\Http\Resources;

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
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
