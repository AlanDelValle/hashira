<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Organisations\Models\OrganisationInvitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An offer that has not been taken up.
 *
 * The token is never in here. An admin listing what is outstanding does not need it, and a
 * token in a list is a token in a log, a screenshot and a support conversation — see
 * ShareLinkResource, which sends a whole URL because that one is meant to be copied. This one
 * is not: it is delivered to an address and only that address can use it.
 *
 * @mixin OrganisationInvitation
 */
final class OrganisationInvitationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'role' => $this->role->value,
            'invitedAt' => $this->created_at->toIso8601String(),
            'expiresAt' => $this->expires_at?->toIso8601String(),

            // For the person who was invited rather than the admin who invited: which firm,
            // and who asked. An invitation that says neither is indistinguishable from spam.
            'organisationName' => $this->whenLoaded(
                'organisation',
                fn () => $this->organisation->name,
            ),
            'invitedByName' => $this->whenLoaded('inviter', fn () => $this->inviter?->name),

            /*
             * The token, and only to the person it was written to — who already has it, in
             * their inbox. It is here so the dashboard can offer Accept without sending them
             * through the email, and it is withheld from the admin's list for the reason at the
             * top of this file.
             */
            'token' => $this->when(
                $request->user() !== null && $this->addresses($request->user()),
                fn () => $this->token,
            ),
        ];
    }
}
