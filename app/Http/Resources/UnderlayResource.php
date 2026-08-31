<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Underlays\Models\Underlay;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Underlay */
final class UnderlayResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'page' => $this->page,
            'width' => $this->width,
            'height' => $this->height,
            // Not the path on disk: the picture is served by a route that checks the policy
            // on the project it belongs to, like everything else about a drawing.
            'url' => route('projects.underlays.image', [
                'project' => $this->project_id,
                'underlay' => $this->id,
            ]),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
