<?php

declare(strict_types=1);

namespace App\Domain\Underlays\Models;

use App\Domain\Projects\Models\Project;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A page of somebody else's drawing, to trace over.
 *
 * It belongs to the project rather than to the person, unlike a block: a survey is imported
 * to draw a particular building on top of, and it is of no use in another project. It is also
 * the one thing in a drawing that is *not* the drawing — see docs/editor.md on why it is
 * never exported.
 *
 * @property string $id
 * @property string $project_id
 * @property string $name
 * @property int $page
 * @property int $width
 * @property int $height
 * @property string $path
 * @property int $bytes
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Underlay extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'page' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'bytes' => 'integer',
        ];
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
