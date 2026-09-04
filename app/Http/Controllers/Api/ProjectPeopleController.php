<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectPersonResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Who can be mentioned here.
 *
 * Readable by anybody who can open the project, because writing a remark aimed at somebody
 * means being able to find their name. It answers with names and ids only — the owner's member
 * list, which names accounts and says when each one joined, is a different endpoint behind a
 * different ability.
 */
final class ProjectPeopleController extends Controller
{
    public function __invoke(Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);

        return ProjectPersonResource::collection($project->people());
    }
}
