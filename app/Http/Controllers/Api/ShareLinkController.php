<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\Actions\IssueShareLink;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreShareLinkRequest;
use App\Http\Resources\ShareLinkResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class ShareLinkController extends Controller
{
    public function show(Project $project): JsonResponse
    {
        Gate::authorize('share', $project);

        $link = $project->loadMissing('activeShareLink')->activeShareLink;

        return response()->json([
            'data' => $link === null ? null : ShareLinkResource::make($link)->resolve(),
        ]);
    }

    public function store(
        StoreShareLinkRequest $request,
        Project $project,
        IssueShareLink $issue,
    ): JsonResponse {
        Gate::authorize('share', $project);

        /** @var User $user */
        $user = $request->user();

        $expiresAt = $request->validated('expiresAt');

        $link = $issue->handle(
            project: $project,
            issuer: $user,
            expiresAt: is_string($expiresAt) ? new \DateTimeImmutable($expiresAt) : null,
        );

        return ShareLinkResource::make($link)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Revocation is a timestamp on every live link, not a delete: two lines of Eloquent with
     * no branching, so it stays here rather than becoming an action class for symmetry.
     */
    public function destroy(Project $project): JsonResponse
    {
        Gate::authorize('share', $project);

        $project->shareLinks()->whereNull('revoked_at')->update(['revoked_at' => now()]);

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
