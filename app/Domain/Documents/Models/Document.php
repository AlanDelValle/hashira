<?php

declare(strict_types=1);

namespace App\Domain\Documents\Models;

use App\Domain\Projects\Models\Project;
use Database\Factories\DocumentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * The drawing. `data` holds the whole document as described in docs/document-format.md;
 * `revision` is the optimistic-concurrency guard that autosave checks against.
 *
 * @property string $id
 * @property string $project_id
 * @property string $name
 * @property int $schema_version
 * @property int $revision
 * @property array<string, mixed> $data
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['name', 'schema_version', 'data'])]
#[UseFactory(DocumentFactory::class)]
class Document extends Model
{
    /** @use HasFactory<DocumentFactory> */
    use HasFactory;

    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'data' => 'array',
            'schema_version' => 'integer',
            'revision' => 'integer',
        ];
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return HasMany<DocumentVersion, $this> */
    public function versions(): HasMany
    {
        return $this->hasMany(DocumentVersion::class)->latest('created_at');
    }
}
