<?php

declare(strict_types=1);

namespace App\Domain\Projects\Actions;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class DuplicateProject
{
    /**
     * Copy a project and its drawing into somebody's own account.
     *
     * The owner is passed in rather than read off the original, because the two stopped being
     * the same thing when projects gained members: a collaborator duplicating a drawing must
     * get a copy of their own, not another project filed under the person who let them in.
     *
     * Deliberately not copied: version history, which belongs to the original's timeline,
     * share links, because a duplicate must never inherit an audience, and the members, for
     * the same reason.
     */
    public function handle(Project $project, User $owner): Project
    {
        return DB::transaction(function () use ($project, $owner): Project {
            $copy = $owner->projects()->create([
                'name' => $this->copyName($project->name),
                'description' => $project->description,
            ]);

            $source = $project->loadMissing('document')->document;

            if ($source !== null) {
                $copy->documents()->create([
                    'name' => $source->name,
                    'schema_version' => $source->schema_version,
                    'data' => $source->data,
                ]);
            }

            return $copy->load('document');
        });
    }

    private function copyName(string $name): string
    {
        $suffix = ' (copy)';
        $limit = 120;

        return mb_strlen($name.$suffix) <= $limit
            ? $name.$suffix
            : mb_substr($name, 0, $limit - mb_strlen($suffix)).$suffix;
    }
}
