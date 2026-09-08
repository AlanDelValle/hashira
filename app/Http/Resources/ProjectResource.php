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

        $administered = $user !== null && $this->administeredBy($user);

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
            'role' => $administered
                ? 'owner'
                : ($user === null ? null : $this->effectiveRole($user)?->value),

            /*
             * Whose it is, when that is worth saying. Somebody else's drawing, obviously — and
             * also a firm's own, because an admin holds 'owner' in it and would otherwise be
             * unable to tell the firm's work from their own on the same list.
             */
            'ownerName' => $this->when(
                ! $administered || $this->organisation_id !== null,
                fn () => $this->ownerName(),
            ),

            // Which firm's it is, when it is a firm's. Null for somebody's own drawing, which
            // is what lets the dashboard group without asking a second question.
            'organisationId' => $this->organisation_id,

            /*
             * Whether being in the firm is enough to open it. Only meaningful for a firm's
             * project, and only acted on by whoever administers one — but sent to everybody who
             * can see the card, because a drawing not everybody can open is worth saying so on.
             */
            'restricted' => $this->restricted_at !== null,

            // Their own membership, which is the thing they delete in order to leave. Nobody
            // should be stuck in somebody else's project because they once opened a link.
            'membershipId' => $this->when(
                ! $administered && $user !== null,
                fn () => $this->membershipFor($user)?->id,
            ),
        ];
    }
}
