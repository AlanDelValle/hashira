<?php

declare(strict_types=1);

namespace App\Domain\Sharing\Actions;

use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\Models\ShareLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Taking up a link, which is how somebody becomes the second person in a project.
 *
 * This is the one moment a token decides anything. It writes a row; from then on every
 * authorization reads that row and the link is not consulted again — which is what lets a
 * capability URL coexist with a policy that only ever answers about an authenticated user.
 *
 * A viewer link writes nothing. Viewing is anonymous by decision, so there is nobody to
 * record, and recording the owner of the project in their own project would be a second,
 * weaker answer to a question `isOwnedBy` already answers.
 */
final class AcceptShareLink
{
    public function handle(ShareLink $link, User $user): ?ProjectMember
    {
        if (! $link->role->requiresAccount()) {
            return null;
        }

        if ($link->loadMissing('project')->project->isOwnedBy($user)) {
            return null;
        }

        return DB::transaction(function () use ($link, $user): ProjectMember {
            $member = ProjectMember::query()
                ->where('project_id', $link->project_id)
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            if ($member === null) {
                $member = new ProjectMember;
                $member->project_id = $link->project_id;
                $member->user_id = (int) $user->getKey();
                $member->joined_at = now();
            } elseif (! $link->role->atLeast($member->role)) {
                /*
                 * Somebody already here opening a weaker link keeps what they have. An owner
                 * issuing a commenter link is inviting more people, not demoting the editor
                 * who is halfway through a drawing; taking access away is a deliberate act
                 * and it has its own control.
                 */
                return $member;
            }

            $member->role = $link->role;
            $member->share_link_id = $link->id;
            $member->save();

            return $member;
        });
    }
}
