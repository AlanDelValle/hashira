<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Organisations\OrganisationRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateOrganisationMemberRequest;
use App\Http\Resources\OrganisationMemberResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Who is in a firm, what they hold, and how they stop being in it.
 *
 * Everything here defends one invariant: a firm always has an admin. A firm without one can
 * still be worked in and can never be administered again — nobody can invite, rename or delete
 * it — and it is the single state the interface offers no way out of. So the last admin cannot
 * be demoted, cannot be removed, and cannot leave.
 */
final class OrganisationMemberController extends Controller
{
    /**
     * Listing is for members, not only admins. Knowing who else is in the firm whose drawings
     * you are working on is not privileged information, and it is the list mentions come from.
     */
    public function index(Organisation $organisation): AnonymousResourceCollection
    {
        Gate::authorize('view', $organisation);

        return OrganisationMemberResource::collection(
            $organisation->members()->with('user')->orderBy('joined_at')->get(),
        );
    }

    public function update(
        UpdateOrganisationMemberRequest $request,
        Organisation $organisation,
        OrganisationMember $member,
    ): OrganisationMemberResource {
        Gate::authorize('manageMembers', $organisation);

        $this->assertBelongs($member, $organisation);

        $role = OrganisationRole::from((string) $request->validated('role'));

        if (! $role->administers() && $organisation->isLastAdmin($member->user)) {
            throw ValidationException::withMessages([
                'role' => 'Somebody has to administer this organisation. Make another person an admin first.',
            ]);
        }

        $member->role = $role;
        $member->save();

        return OrganisationMemberResource::make($member->load('user'));
    }

    /**
     * An admin showing somebody out, or somebody leaving of their own accord.
     *
     * Leaving needs nobody's permission, for the reason leaving a project does not: being in a
     * firm is a standing, not a sentence. The exception is the last admin, who would be
     * abandoning something rather than leaving it.
     */
    public function destroy(
        Request $request,
        Organisation $organisation,
        OrganisationMember $member,
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();

        $this->assertBelongs($member, $organisation);

        $leaving = $member->user_id === (int) $user->getKey();

        if (! $leaving) {
            Gate::authorize('manageMembers', $organisation);
        } else {
            Gate::authorize('view', $organisation);
        }

        if ($organisation->isLastAdmin($member->user)) {
            throw ValidationException::withMessages([
                'member' => $leaving
                    ? 'You are the only admin. Make somebody else an admin before you leave.'
                    : 'This is the only admin. Make somebody else an admin first.',
            ]);
        }

        $member->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** A member of another firm is not refused here, it is not found. */
    private function assertBelongs(OrganisationMember $member, Organisation $organisation): void
    {
        if ($member->organisation_id !== $organisation->id) {
            throw new NotFoundHttpException;
        }
    }
}
