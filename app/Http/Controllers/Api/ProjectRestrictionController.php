<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Taking the firm's default away from one drawing, and giving it back.
 *
 * A route of its own rather than a field on `PATCH /projects/{project}`, because the two are
 * different acts asked of different people: renaming a drawing is something an editor does,
 * and deciding who may open it is not. Riding on the same endpoint would mean one gate for
 * both, and the weaker of the two would have to win.
 */
final class ProjectRestrictionController extends Controller
{
    public function update(Request $request, Project $project): ProjectResource
    {
        Gate::authorize('manageMembers', $project);

        $restricted = $request->boolean('restricted');

        /*
         * There is nothing to withhold on a drawing one person owns. Refusing here rather than
         * letting it through keeps the column meaning one thing — the database says the same
         * with a check constraint, and this is the sentence a person gets instead of a 500.
         */
        if ($restricted && $project->organisation_id === null) {
            throw ValidationException::withMessages([
                'restricted' => 'Only an organisation’s project can be restricted; this one is yours.',
            ]);
        }

        $project->restricted_at = $restricted ? ($project->restricted_at ?? now()) : null;
        $project->save();

        return ProjectResource::make(
            $project->load(['document', 'activeShareLink', 'members', 'owner', 'organisation.members']),
        );
    }
}
