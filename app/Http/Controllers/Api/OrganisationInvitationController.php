<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Organisations\Actions\InviteToOrganisation;
use App\Domain\Organisations\Models\Organisation;
use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Organisations\OrganisationRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrganisationInvitationRequest;
use App\Http\Resources\OrganisationInvitationResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The offers a firm has out, made and withdrawn by its admins.
 *
 * Accepting one is somewhere else entirely — see `InvitationController` — because accepting is
 * the invitee's act and is authorized by the address the invitation was written to rather than
 * by any standing in the firm. Somebody accepting is by definition not in it yet.
 */
final class OrganisationInvitationController extends Controller
{
    public function index(Organisation $organisation): AnonymousResourceCollection
    {
        Gate::authorize('manageMembers', $organisation);

        return OrganisationInvitationResource::collection(
            $organisation->invitations()->open()->with('inviter')->latest()->get(),
        );
    }

    public function store(
        StoreOrganisationInvitationRequest $request,
        Organisation $organisation,
        InviteToOrganisation $invite,
    ): JsonResponse {
        Gate::authorize('manageMembers', $organisation);

        /** @var User $inviter */
        $inviter = $request->user();

        $email = mb_strtolower(trim((string) $request->validated('email')));

        $this->assertNotAlreadyHere($organisation, $email);

        $invitation = $invite->handle(
            organisation: $organisation,
            inviter: $inviter,
            email: $email,
            role: OrganisationRole::from((string) $request->validated('role')),
        );

        return OrganisationInvitationResource::make($invitation->load('inviter'))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /** Withdrawing an offer. Marked rather than deleted, so the list is a record. */
    public function destroy(
        Organisation $organisation,
        OrganisationInvitation $invitation,
    ): JsonResponse {
        Gate::authorize('manageMembers', $organisation);

        if ($invitation->organisation_id !== $organisation->id) {
            throw new NotFoundHttpException;
        }

        $invitation->revoked_at = now();
        $invitation->save();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * Inviting somebody who is already here is a mistake worth naming.
     *
     * Letting it through would send them an email offering something they have, and put a row
     * in the outstanding list that can never be accepted into anything.
     */
    private function assertNotAlreadyHere(Organisation $organisation, string $email): void
    {
        $here = OrganisationMember::query()
            ->where('organisation_id', $organisation->id)
            ->whereHas('user', fn ($query) => $query->whereRaw('lower(email) = ?', [$email]))
            ->exists();

        if ($here) {
            throw ValidationException::withMessages([
                'email' => 'That person is already in this organisation.',
            ]);
        }
    }
}
