<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Domain\Documents\DocumentSchema;
use App\Domain\Documents\Models\Document;
use App\Domain\Projects\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Document> */
final class DocumentFactory extends Factory
{
    protected $model = Document::class;

    public function definition(): array
    {
        $name = ucfirst($this->faker->words(2, true));

        return [
            'project_id' => Project::factory(),
            'name' => $name,
            'schema_version' => DocumentSchema::CURRENT_VERSION,
            'data' => DocumentSchema::blank($name),
        ];
    }
}
