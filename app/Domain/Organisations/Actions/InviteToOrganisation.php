<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Actions;

use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Domain\Organisations\Notifications\InvitedToOrganisation;
use App\Domain\Organisations\OrganisationRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Asking somebody to join, which is not the same as putting them in.
 *
 * Inviting writes nothing but the invitation. The membership row is written when the person
 * accepts, by `AcceptOrganisationInvitation` — the same shape a share link has, and for a
 * better reason than symmetry: being in a firm means seeing its work and being seen in it, and
 * that is not a thing to do to somebody who has not agreed to it.
 *
 * Inviting an address that already holds an open invitation renews it rather than failing. An
 * admin whose colleague never received the first one should be able to click the same button
 * again, and a second row would only be a second thing to revoke.
 */
final class InviteToOrganisation
{
    private const TOKEN_BYTES = 32;

    private const DAYS_OPEN = 14;

    public function handle(
        Organisation $organisation,
        User $inviter,
        string $email,
        OrganisationRole $role,
    ): OrganisationInvitation {
        $address = mb_strtolower(trim($email));

        $invitation = DB::transaction(function () use ($organisation, $inviter, $address, $role) {
            $invitation = OrganisationInvitation::query()
                ->where('organisation_id', $organisation->id)
                ->where('email', $address)
                ->open()
                ->lockForUpdate()
                ->first() ?? new OrganisationInvitation;

            $invitation->organisation_id = $organisation->id;
            $invitation->email = $address;
            $invitation->role = $role;
            $invitation->invited_by = (int) $inviter->getKey();
            $invitation->expires_at = now()->addDays(self::DAYS_OPEN);

            // Renewing means a new token as well as a new expiry: the point of renewing is
            // usually that the first link went somewhere it should not have.
            $invitation->token = self::token();

            $invitation->save();

            return $invitation;
        });

        /*
         * Sent to an address rather than to a notifiable, because the whole point is that the
         * person may not have an account yet. It goes out after the transaction commits: an
         * email about a row that was rolled back is worse than no email.
         */
        Notification::route('mail', $address)
            ->notify(new InvitedToOrganisation($invitation->load('organisation'), $inviter));

        return $invitation;
    }

    private static function token(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(self::TOKEN_BYTES)), '+/', '-_'), '=');
    }
}
