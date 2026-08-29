<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Ownership is the whole authorization model in the MVP, and it is checked here rather than
 * inferred from anything in the request. Documents, versions and share links all authorize
 * through their project, so there is exactly one place this rule can be wrong.
 *
 * Denials are reported as 404 rather than 403: a stranger holding someone else's project id
 * should not be able to learn that it exists.
 */
final class ProjectPolicy
{
    public function view(User $user, Project $project): Response
    {
        return $this->owns($user, $project);
    }

    public function update(User $user, Project $project): Response
    {
        return $this->owns($user, $project);
    }

    public function delete(User $user, Project $project): Response
    {
        return $this->owns($user, $project);
    }

    public function share(User $user, Project $project): Response
    {
        return $this->owns($user, $project);
    }

    private function owns(User $user, Project $project): Response
    {
        return $user->getKey() === $project->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
