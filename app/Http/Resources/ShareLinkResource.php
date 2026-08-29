<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Sharing\Models\ShareLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ShareLink */
final class ShareLinkResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'url' => url("/share/{$this->token}"),
            'role' => $this->role,
            'expiresAt' => $this->expires_at?->toIso8601String(),
            'lastViewedAt' => $this->last_viewed_at?->toIso8601String(),
            'viewCount' => $this->view_count,
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
