<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Projects\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Project */
final class ProjectResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'createdAt' => $this->created_at->toIso8601String(),
            'updatedAt' => $this->updated_at->toIso8601String(),
            'documentId' => $this->whenLoaded('document', fn () => $this->document?->id),
            'isShared' => $this->whenLoaded(
                'activeShareLink',
                fn () => $this->activeShareLink !== null,
            ),
        ];
    }
}
