<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Documents\Models\DocumentOperation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One edit, on its way back out — the same shape the broadcast carries, so a client catching
 * up and a client listening are reading one thing and not two.
 *
 * @mixin DocumentOperation
 */
final class DocumentOperationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'sequence' => $this->sequence,
            'origin' => $this->origin,
            'envelope' => $this->envelope,
        ];
    }
}
