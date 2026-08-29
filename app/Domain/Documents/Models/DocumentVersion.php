<?php

declare(strict_types=1);

namespace App\Domain\Documents\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An immutable snapshot of a document at a point in time. The MVP only creates these on
 * request; the table exists now so that automatic and browsable history is a feature to
 * build rather than a schema to retrofit.
 *
 * @property string $id
 * @property string $document_id
 * @property string|null $label
 * @property int $schema_version
 * @property int $revision
 * @property array<string, mixed> $data
 * @property int|null $created_by
 * @property Carbon $created_at
 */
#[Fillable(['label', 'schema_version', 'revision', 'data', 'created_by'])]
class DocumentVersion extends Model
{
    use HasUlids;

    /** Versions are written once and never updated. */
    public const UPDATED_AT = null;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'data' => 'array',
            'schema_version' => 'integer',
            'revision' => 'integer',
        ];
    }

    /** @return BelongsTo<Document, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
