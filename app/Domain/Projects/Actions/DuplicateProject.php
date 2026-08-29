<?php

declare(strict_types=1);

namespace App\Domain\Projects\Actions;

use App\Domain\Projects\Models\Project;
use Illuminate\Support\Facades\DB;

final class DuplicateProject
{
    /**
     * Copy a project and its drawing.
     *
     * Deliberately not copied: version history, which belongs to the original's timeline,
     * and share links, because a duplicate must never inherit an audience.
     */
    public function handle(Project $project): Project
    {
        return DB::transaction(function () use ($project): Project {
            $copy = $project->loadMissing('owner')->owner->projects()->create([
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
