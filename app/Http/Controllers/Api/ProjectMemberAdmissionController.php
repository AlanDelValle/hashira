<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use App\Domain\Sharing\ShareRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\AdmitProjectMemberRequest;
use App\Http\Resources\ProjectMemberResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Naming somebody from the firm on one of its drawings.
 *
 * This is what makes restriction usable: with the firm's default taken away, a row is the only
 * way in, and until now the only thing that wrote one was somebody accepting a share link.
 *
 * **It admits colleagues and never strangers.** Whoever is named has to be in the organisation
 * that owns the project. A second way to hand access to an arbitrary account would be a second
 * admission path around the invitation this phase just built, and getting a stranger into a
 * firm's drawing is what share links are for — they are a capability the recipient chooses to
 * take up, rather than a decision made about somebody who never agreed to anything.
 *
 * It doubles as the narrowing 10.2c is about, in the other direction: naming a colleague as a
 * `commenter` on an unrestricted project overrides the editing the firm grants them, because a
 * row on the project always wins.
 */
final class ProjectMemberAdmissionController extends Controller
{
    public function store(AdmitProjectMemberRequest $request, Project $project): JsonResponse
    {
        Gate::authorize('manageMembers', $project);

        $user = User::query()->findOrFail($request->validated('userId'));

        $this->assertInTheSameFirm($project, $user);

        if ($project->isOwnedBy($user)) {
            throw ValidationException::withMessages([
                'userId' => 'That person owns this drawing.',
            ]);
        }

        /*
         * Set field by field rather than through `firstOrNew`, which fills from an array and
         * would need `project_id` and `user_id` to be mass assignable — and nothing on
         * `ProjectMember` is, deliberately: it is where a stray attribute hands out access.
         */
        $member = ProjectMember::query()
            ->where('project_id', $project->id)
            ->where('user_id', $user->getKey())
            ->first();

        $created = $member === null;

        if ($member === null) {
            $member = new ProjectMember;
            $member->project_id = $project->id;
            $member->user_id = (int) $user->getKey();
            $member->joined_at = now();
        }

        $member->role = ShareRole::from((string) $request->validated('role'));
        $member->save();

        return ProjectMemberResource::make($member->load('user'))
            ->response()
            ->setStatusCode($created ? Response::HTTP_CREATED : Response::HTTP_OK);
    }

    private function assertInTheSameFirm(Project $project, User $user): void
    {
        $inTheFirm = $project->organisation_id !== null
            && $project->loadMissing('organisation')->organisation?->roleFor($user) !== null;

        if (! $inTheFirm) {
            throw ValidationException::withMessages([
                'userId' => 'Only somebody already in this organisation can be named here. Share a link instead.',
            ]);
        }
    }
}
