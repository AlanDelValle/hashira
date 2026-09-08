<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Organisations\Models\Organisation;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Who may do what to an organisation.
 *
 * The same two shapes of denial `ProjectPolicy` uses, for the same reasons: somebody with no
 * standing here is told 404, because a stranger holding an id should not learn that the firm
 * exists; somebody who is in it but may not do this particular thing is told 403, because
 * pretending the organisation they are looking at is imaginary would be a lie they can see
 * through.
 *
 * There is no `create`. Anybody with an account may start one, and a policy method that always
 * returns true is a question nobody was asking.
 */
final class OrganisationPolicy
{
    public function view(User $user, Organisation $organisation): Response
    {
        return $organisation->roleFor($user) !== null
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /** Renaming it. */
    public function update(User $user, Organisation $organisation): Response
    {
        return $this->adminOnly($user, $organisation, 'Only an admin can rename this organisation.');
    }

    /**
     * Deleting it, which takes its projects with it — the foreign key cascades.
     *
     * That is the intended meaning rather than an accident of the schema: an organisation's
     * drawings belong to the organisation, so there is nowhere for them to go when it is gone.
     * The interface is expected to say so before asking.
     */
    public function delete(User $user, Organisation $organisation): Response
    {
        return $this->adminOnly($user, $organisation, 'Only an admin can delete this organisation.');
    }

    /** Listing who is in it, admitting somebody, and showing somebody out. */
    public function manageMembers(User $user, Organisation $organisation): Response
    {
        return $this->adminOnly($user, $organisation, 'Only an admin can manage who is here.');
    }

    /** Starting a project the organisation owns. Any member may; that is what membership is. */
    public function createProject(User $user, Organisation $organisation): Response
    {
        return $organisation->roleFor($user) !== null
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    private function adminOnly(User $user, Organisation $organisation, string $message): Response
    {
        $role = $organisation->roleFor($user);

        if ($role === null) {
            return Response::denyAsNotFound();
        }

        return $role->administers() ? Response::allow() : Response::deny($message);
    }
}
