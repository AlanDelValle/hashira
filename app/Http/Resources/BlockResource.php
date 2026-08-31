<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Blocks\Models\Block;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Shaped exactly like a built-in block's definition, so the editor can put the two side by
 * side in one library without knowing which is which.
 *
 * @mixin Block
 */
final class BlockResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category,
            'width' => $this->width,
            'height' => $this->height,
            'draw' => $this->draw,
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
