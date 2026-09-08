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
 * record, and recording somebody who already administers the project would be a second, weaker
 * answer to a question `administeredBy` already answers.
 */
final class AcceptShareLink
{
    public function handle(ShareLink $link, User $user): ?ProjectMember
    {
        if (! $link->role->requiresAccount()) {
            return null;
        }

        $project = $link->loadMissing('project')->project;

        if ($project->administeredBy($user)) {
            return null;
        }

        return DB::transaction(function () use ($link, $project, $user): ?ProjectMember {
            $member = ProjectMember::query()
                ->where('project_id', $link->project_id)
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            /*
             * What they already hold, from wherever it comes. Asking the row alone was right
             * while a row was the only way to hold anything; since 10.2 an organisation grants
             * editing on its own projects, and a commenter link taken up by somebody in the
             * firm would have written a row that *narrowed* them — because a row on the project
             * is exactly what overrides the organisation. Accepting a link has never taken
             * access away and must not start here.
             */
            $held = $member === null ? $project->effectiveRole($user) : $member->role;

            if ($held !== null && ! $link->role->atLeast($held)) {
                return $member;
            }

            if ($member === null) {
                $member = new ProjectMember;
                $member->project_id = $link->project_id;
                $member->user_id = (int) $user->getKey();
                $member->joined_at = now();
            }

            $member->role = $link->role;
            $member->share_link_id = $link->id;
            $member->save();

            return $member;
        });
    }
}
