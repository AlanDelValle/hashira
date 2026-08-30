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

        /*
         * A second, empty project, so the dashboard shows more than one row — dated a day
         * back. The dashboard orders by recent activity, and two projects seeded in the same
         * second tie, which would let the empty one sort above the sample plan and make the
         * first thing anyone sees an empty sheet.
         */
        $renovation = $createProject->handle($demo, 'House Renovation');
        $renovation->timestamps = false;
        $renovation->update(['created_at' => now()->subDay(), 'updated_at' => now()->subDay()]);

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
