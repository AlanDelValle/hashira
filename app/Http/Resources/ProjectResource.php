<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Documents\DrawingSummary;
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
            /*
             * Whether there is a link out, and what it hands out — one field, because a role
             * that is there says both. 9.4 gave a link a role and the card has been saying
             * "Shared" ever since, which is the one thing about a link that was never in
             * question: what an owner wants to know at a glance is whether they published a
             * drawing or handed somebody the pen.
             */
            'sharedRole' => $this->whenLoaded(
                'activeShareLink',
                fn () => $this->activeShareLink?->role->value,
            ),

            /*
             * What the drawing is, counted in the database rather than read out of it — page
             * size, plotted scale, and how much is on it. Only the list asks for this, so it
             * is absent everywhere else rather than null: a card that knows nothing about the
             * drawing and a project that has none are different states.
             */
            'drawing' => $this->whenHas(
                'drawing_summary',
                fn () => DrawingSummary::fromJson($this->drawing_summary)?->toArray(),
            ),

            // Conversations still open on it, for the same list and by the same rule.
            'openComments' => $this->whenHas(
                'open_comments_count',
                fn () => (int) $this->open_comments_count,
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
