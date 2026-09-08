<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Organisations\Actions\CreateOrganisation;
use App\Domain\Organisations\Models\Organisation;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrganisationRequest;
use App\Http\Requests\UpdateOrganisationRequest;
use App\Http\Resources\OrganisationResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class OrganisationController extends Controller
{
    /**
     * The firms this person is in.
     *
     * Filtered by membership rather than authorized afterwards: an organisation somebody is
     * not in is not refused, it is not found — the same shape the mentions list uses.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        $organisations = Organisation::query()
            ->whereHas('members', fn (Builder $member) => $member->where('user_id', $user->getKey()))
            ->with('members')
            ->orderBy('name')
            ->get();

        return OrganisationResource::collection($organisations);
    }

    /** Anybody with an account may start one, and whoever starts it administers it. */
    public function store(
        StoreOrganisationRequest $request,
        CreateOrganisation $createOrganisation,
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();

        $organisation = $createOrganisation->handle($user, $request->validated('name'));

        return OrganisationResource::make($organisation)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function update(
        UpdateOrganisationRequest $request,
        Organisation $organisation,
    ): OrganisationResource {
        Gate::authorize('update', $organisation);

        $organisation->update($request->validated());

        return OrganisationResource::make($organisation->load('members'));
    }

    /**
     * Deleting takes the organisation's projects with it, because they are its projects and
     * there is nowhere else for them to go. The foreign key does that; what matters here is
     * that the interface has said so before this is reached.
     */
    public function destroy(Organisation $organisation): Response
    {
        Gate::authorize('delete', $organisation);

        $organisation->delete();

        return response()->noContent();
    }
}
