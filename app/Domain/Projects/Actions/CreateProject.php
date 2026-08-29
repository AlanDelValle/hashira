<?php

declare(strict_types=1);

namespace App\Domain\Projects\Actions;

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class CreateProject
{
    /**
     * A project without a drawing is a broken state the rest of the app would have to defend
     * against, so the two are created together or not at all.
     */
    public function handle(User $owner, string $name, ?string $description = null): Project
    {
        return DB::transaction(function () use ($owner, $name, $description): Project {
            $project = $owner->projects()->create([
                'name' => $name,
                'description' => $description,
            ]);

            $project->documents()->create([
                'name' => $name,
                'schema_version' => DocumentSchema::CURRENT_VERSION,
                'data' => DocumentSchema::blank($name),
            ]);

            return $project->load('document');
        });
    }
}
