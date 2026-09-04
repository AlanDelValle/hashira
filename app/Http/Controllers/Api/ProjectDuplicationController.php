<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Actions\DuplicateProject;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class ProjectDuplicationController extends Controller
{
    public function __invoke(
        Request $request,
        Project $project,
        DuplicateProject $duplicate,
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();

        // An editor's privilege, not a viewer's. Taking a copy of somebody's drawing into
        // your own account is a bigger thing than looking at it.
        Gate::authorize('update', $project);

        $copy = $duplicate->handle($project->load('document'), $user);

        return ProjectResource::make($copy)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }
}
