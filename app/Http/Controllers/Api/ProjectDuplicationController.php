<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Actions\DuplicateProject;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class ProjectDuplicationController extends Controller
{
    public function __invoke(Project $project, DuplicateProject $duplicate): JsonResponse
    {
        Gate::authorize('view', $project);

        $copy = $duplicate->handle($project->load('document'));

        return ProjectResource::make($copy)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }
}
