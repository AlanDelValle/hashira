<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Project */
final class ProjectResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var User|null $user */
        $user = $request->user();

        $owned = $user !== null && $this->isOwnedBy($user);

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

            /*
             * What the person asking holds here. A card in a list has to say whether it is
             * yours before it says anything else about it, and the editor refuses to open a
             * drawing this does not permit changing.
             */
            'role' => $owned ? 'owner' : ($user === null ? null : $this->memberRole($user)?->value),

            // Only worth saying about somebody else's drawing.
            'ownerName' => $this->when(
                ! $owned && $this->relationLoaded('owner'),
                fn () => $this->owner?->name,
            ),

            // Their own membership, which is the thing they delete in order to leave. Nobody
            // should be stuck in somebody else's project because they once opened a link.
            'membershipId' => $this->when(
                ! $owned && $user !== null,
                fn () => $this->membershipFor($user)?->id,
            ),
        ];
    }
}
