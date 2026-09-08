<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Putting a finished project away, and taking it back out.
 *
 * `projects.archived_at` has been in the schema since Phase 1, written by nothing and read by
 * nothing — the same dead field `style.strokeWidth` was before Phase 12 removed it. It is kept
 * rather than dropped because a list is the thing this column was for: a drafting office
 * finishes jobs, and a job that finished last year should not be between two that are live.
 *
 * A route of its own, for the reason restriction has one. `PATCH /projects/{project}` is gated
 * on `update`, which an editor holds, and taking a drawing off everybody's list is not an
 * editor's act.
 *
 * **Nothing is hidden and nothing is lost.** An archived drawing opens at its own address,
 * exports, keeps its share links and its conversations. What changes is where the list puts
 * it — which is why this is not a soft delete and does not pretend to be one.
 */
final class ProjectArchiveController extends Controller
{
    public function update(Request $request, Project $project): ProjectResource
    {
        Gate::authorize('archive', $project);

        $archived = $request->boolean('archived');

        // Archiving something already archived must not move the date: it says when the work
        // was put away, and a second click on a stale card would otherwise rewrite that.
        $project->archived_at = $archived ? ($project->archived_at ?? now()) : null;
        $project->save();

        return ProjectResource::make(
            $project->load(['document', 'activeShareLink', 'members', 'owner', 'organisation.members']),
        );
    }
}
