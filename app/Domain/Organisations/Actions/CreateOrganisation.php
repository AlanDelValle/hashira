<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Actions;

use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Organisations\OrganisationRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Starting a firm, and being in it.
 *
 * The two happen together or not at all. An organisation with nobody in it is a row that
 * nothing can reach — not even the person who made it, since `created_by` is kept for the
 * record and is not consulted by any policy. That would be an organisation somebody has to be
 * added to by a person who cannot themselves get in.
 */
final class CreateOrganisation
{
    public function handle(User $founder, string $name): Organisation
    {
        return DB::transaction(function () use ($founder, $name): Organisation {
            $organisation = new Organisation;
            $organisation->name = $name;
            $organisation->created_by = (int) $founder->getKey();
            $organisation->save();

            $member = new OrganisationMember;
            $member->organisation_id = $organisation->id;
            $member->user_id = (int) $founder->getKey();
            $member->role = OrganisationRole::Admin;
            $member->joined_at = now();
            $member->save();

            return $organisation->load('members');
        });
    }
}
