<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Project> */
final class ProjectFactory extends Factory
{
    protected $model = Project::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => ucfirst($this->faker->words(2, true)),
            'description' => null,
        ];
    }
}
