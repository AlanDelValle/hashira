<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Comments\Models\CommentThread;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A conversation and where it points.
 *
 * `x` and `y` are drawing millimetres, the same units the document itself is in, so the
 * client converts them through the viewport transform like any other coordinate and never
 * does pixel arithmetic of its own.
 *
 * @mixin CommentThread
 */
final class CommentThreadResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'x' => $this->x,
            'y' => $this->y,
            'elementId' => $this->element_id,
            'resolved' => $this->isResolved(),
            'resolvedAt' => $this->resolved_at?->toIso8601String(),
            'authorId' => $this->created_by,
            'authorName' => $this->author?->name,
            'createdAt' => $this->created_at->toIso8601String(),
            'comments' => CommentResource::collection($this->comments),
        ];
    }
}
