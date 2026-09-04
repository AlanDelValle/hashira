<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Who may do what to a project, answered here and nowhere else.
 *
 * There are two ways to be in a project: own it, or hold a membership row in it. Both are
 * state in the database, checked against the authenticated user — a share token is read once,
 * when it is accepted, and never again. That is non-negotiable rule 6, and it is why a link
 * that grants more than viewing has to be taken up by somebody with an account.
 *
 * Denials come in two flavours, and the difference matters. Somebody with no access at all is
 * told 404: a stranger holding a project id should not learn that it exists. Somebody who is
 * in the project but is not allowed this particular thing is told 403, because pretending the
 * drawing they are looking at does not exist would be a lie they can see through.
 */
final class ProjectPolicy
{
    public function view(User $user, Project $project): Response
    {
        return $this->hasAccess($user, $project)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function update(User $user, Project $project): Response
    {
        if (! $this->hasAccess($user, $project)) {
            return Response::denyAsNotFound();
        }

        return $project->isOwnedBy($user) || $project->memberRole($user)?->canEdit() === true
            ? Response::allow()
            : Response::deny('You can look at this drawing, but not change it.');
    }

    /**
     * Leaving a comment. Nothing calls this yet — comments are 9.3 — but it is what tells a
     * commenter apart from a viewer, and a role nobody can ask about is a role that means
     * nothing. The test suite is its caller until the feature is.
     */
    public function comment(User $user, Project $project): Response
    {
        if (! $this->hasAccess($user, $project)) {
            return Response::denyAsNotFound();
        }

        return $project->isOwnedBy($user) || $project->memberRole($user)?->canComment() === true
            ? Response::allow()
            : Response::deny('You can look at this drawing, but not comment on it.');
    }

    public function delete(User $user, Project $project): Response
    {
        return $this->ownerOnly($user, $project, 'Only the owner can delete this project.');
    }

    public function share(User $user, Project $project): Response
    {
        return $this->ownerOnly($user, $project, 'Only the owner can share this project.');
    }

    /** Listing who is in the project, and removing them. */
    public function manageMembers(User $user, Project $project): Response
    {
        return $this->ownerOnly($user, $project, 'Only the owner can manage who has access.');
    }

    private function ownerOnly(User $user, Project $project, string $message): Response
    {
        if (! $this->hasAccess($user, $project)) {
            return Response::denyAsNotFound();
        }

        return $project->isOwnedBy($user) ? Response::allow() : Response::deny($message);
    }

    private function hasAccess(User $user, Project $project): bool
    {
        return $project->isOwnedBy($user) || $project->memberRole($user) !== null;
    }
}
