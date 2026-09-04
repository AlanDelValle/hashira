<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectMemberResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Who is in a project besides its owner, and taking them back out.
 *
 * Removal lives here rather than on the share link because the two are deliberately separate:
 * revoking a link closes the door, and this is what asks somebody already inside to leave.
 * Collapsing them would mean an owner cannot re-issue a link without evicting their own
 * collaborators.
 */
final class ProjectMemberController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        Gate::authorize('manageMembers', $project);

        return ProjectMemberResource::collection(
            $project->members()->with('user')->orderBy('joined_at')->get(),
        );
    }

    /**
     * The owner removing somebody, or somebody removing themselves. Leaving is allowed
     * without the owner's permission for the obvious reason: nobody should be stuck in
     * somebody else's project because they once opened a link.
     */
    public function destroy(Request $request, Project $project, ProjectMember $member): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($member->project_id !== $project->id) {
            throw new NotFoundHttpException;
        }

        if ($member->user_id !== (int) $user->getKey()) {
            Gate::authorize('manageMembers', $project);
        }

        $member->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
