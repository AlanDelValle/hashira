<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Documents\Models\DocumentVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Listings return metadata only. The payload of a version is large and is only ever wanted
 * for one version at a time, so `data` is included solely when the caller asked for that
 * single version.
 *
 * @mixin DocumentVersion
 */
final class DocumentVersionResource extends JsonResource
{
    public function __construct(DocumentVersion $resource, private readonly bool $withData = false)
    {
        parent::__construct($resource);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'schemaVersion' => $this->schema_version,
            'revision' => $this->revision,
            'createdAt' => $this->created_at->toIso8601String(),
            'author' => $this->whenLoaded('author', fn () => $this->author?->name),
            ...($this->withData ? ['drawing' => $this->data] : []),
        ];
    }
}
