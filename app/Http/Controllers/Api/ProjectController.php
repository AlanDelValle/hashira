<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Actions\CreateProject;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class ProjectController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        /*
         * Everything this person can reach: what they own, and what a share link let them
         * into. `members` is eager loaded because the resource asks each project what role
         * the reader holds in it, and a query per card is how a list gets slow quietly.
         */
        $projects = Project::query()
            ->where(function (Builder $query) use ($user): void {
                $query->where('user_id', $user->getKey())
                    ->orWhereHas(
                        'members',
                        fn (Builder $member) => $member->where('user_id', $user->getKey()),
                    );
            })
            ->with(['document', 'activeShareLink', 'members', 'owner'])
            ->orderByDesc('updated_at')
            ->get();

        return ProjectResource::collection($projects);
    }

    public function store(StoreProjectRequest $request, CreateProject $createProject): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $project = $createProject->handle(
            owner: $user,
            name: $request->validated('name'),
            description: $request->validated('description'),
        );

        return ProjectResource::make($project)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Project $project): ProjectResource
    {
        Gate::authorize('view', $project);

        return ProjectResource::make($project->load(['document', 'activeShareLink', 'members', 'owner']));
    }

    public function update(UpdateProjectRequest $request, Project $project): ProjectResource
    {
        Gate::authorize('update', $project);

        $project->update($request->validated());

        return ProjectResource::make($project->load(['document', 'activeShareLink', 'members', 'owner']));
    }

    public function destroy(Project $project): JsonResponse
    {
        Gate::authorize('delete', $project);

        $project->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
