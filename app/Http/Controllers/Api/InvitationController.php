<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Organisations\Actions\AcceptOrganisationInvitation;
use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrganisationInvitationResource;
use App\Http\Resources\OrganisationResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The invitee's side: what has been offered to me, and taking one up.
 *
 * Nothing here asks a policy, because the person doing it is by definition not in the
 * organisation yet. What authorizes it is the address: an invitation is written to one, and
 * only an account with that address can act on it. A forwarded link therefore admits the person
 * it was written to and nobody else, which is the difference between inviting somebody and
 * publishing a way in.
 *
 * Everything is filtered by the signed-in address rather than refused afterwards, so an
 * invitation belonging to somebody else is not denied — it is not found.
 */
final class InvitationController extends Controller
{
    /** What is open for this person, for the dashboard to offer. */
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        return OrganisationInvitationResource::collection(
            $this->openFor($user)->with(['organisation', 'inviter'])->latest()->get(),
        );
    }

    /**
     * One invitation, by the token in the email.
     *
     * Authorized exactly as accepting is — it has to be open and written to the address this
     * account signs in with — so it tells a stranger holding a token nothing that the accept
     * route would not already refuse them. What it exists for is the page the email links to,
     * which must be able to say which firm and who invited before anybody clicks anything.
     */
    public function show(Request $request, OrganisationInvitation $invitation): OrganisationInvitationResource
    {
        /** @var User $user */
        $user = $request->user();

        $this->assertAddressedTo($invitation, $user);

        return OrganisationInvitationResource::make($invitation->load(['organisation', 'inviter']));
    }

    public function accept(
        Request $request,
        OrganisationInvitation $invitation,
        AcceptOrganisationInvitation $accept,
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();

        $this->assertAddressedTo($invitation, $user);

        $accept->handle($invitation, $user);

        return OrganisationResource::make($invitation->organisation->load('members'))
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }

    /**
     * Saying no, which is a real answer and not merely the absence of yes.
     *
     * It marks the invitation rather than deleting it, so an admin sees that it was answered
     * rather than watching it sit in the outstanding list for a fortnight.
     */
    public function decline(Request $request, OrganisationInvitation $invitation): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->assertAddressedTo($invitation, $user);

        $invitation->revoked_at = now();
        $invitation->save();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** @return Builder<OrganisationInvitation> */
    private function openFor(User $user): Builder
    {
        return OrganisationInvitation::query()
            ->open()
            ->whereRaw('lower(email) = ?', [mb_strtolower($user->email)]);
    }

    private function assertAddressedTo(OrganisationInvitation $invitation, User $user): void
    {
        if (! $invitation->isOpen() || ! $invitation->addresses($user)) {
            throw new NotFoundHttpException;
        }
    }
}
