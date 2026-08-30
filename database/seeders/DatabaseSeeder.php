<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Documents\DocumentSchema;
use App\Domain\Projects\Actions\CreateProject;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds a demo account so that a fresh clone can be evaluated without signing up first.
 * Idempotent: running it twice does not produce a second demo user or duplicate projects.
 */
final class DatabaseSeeder extends Seeder
{
    public const DEMO_EMAIL = 'demo@hashira.test';

    public const DEMO_PASSWORD = 'password';

    public function run(CreateProject $createProject): void
    {
        $demo = User::query()->firstOrCreate(
            ['email' => self::DEMO_EMAIL],
            ['name' => 'Demo', 'password' => self::DEMO_PASSWORD],
        );

        if ($demo->projects()->exists()) {
            return;
        }

        // The empty one is created first so the sample plan is the most recently touched, and
        // therefore the row the dashboard lists at the top and the one a demo opens first.
        $createProject->handle($demo, 'House Renovation');

        $studio = $createProject->handle(
            owner: $demo,
            name: 'Studio Apartment',
            description: 'A sample plan to open, edit and export.',
        );

        $document = $studio->document;

        if ($document !== null) {
            $document->update([
                'schema_version' => DocumentSchema::CURRENT_VERSION,
                'data' => DemoPlan::document($studio->name),
            ]);
        }
    }
}
