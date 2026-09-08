<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Actions;

use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Taking up an invitation, which is how somebody becomes part of a firm.
 *
 * This is the one moment the token decides anything. It writes a membership row; from then on
 * every policy reads that row and the token is not consulted again — the same arrangement
 * `AcceptShareLink` has, and the reason a capability URL can coexist with a policy that only
 * ever answers about an authenticated user.
 *
 * Being already in the firm is not a failure. Somebody who was invited, joined by another
 * route, and then found the email is doing nothing wrong; the invitation is marked as taken and
 * their existing standing is left alone. **It never lowers a role**, for the reason accepting a
 * weaker share link never does: an invitation is an offer of more, not an instrument for taking
 * something away.
 */
final class AcceptOrganisationInvitation
{
    public function handle(OrganisationInvitation $invitation, User $user): OrganisationMember
    {
        return DB::transaction(function () use ($invitation, $user): OrganisationMember {
            $member = OrganisationMember::query()
                ->where('organisation_id', $invitation->organisation_id)
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            if ($member === null) {
                $member = new OrganisationMember;
                $member->organisation_id = $invitation->organisation_id;
                $member->user_id = (int) $user->getKey();
                $member->joined_at = now();
                $member->role = $invitation->role;
                $member->save();
            } elseif ($invitation->role->administers() && ! $member->role->administers()) {
                $member->role = $invitation->role;
                $member->save();
            }

            $invitation->accepted_at = now();
            $invitation->save();

            return $member;
        });
    }
}
