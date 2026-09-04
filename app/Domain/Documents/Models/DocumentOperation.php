<?php

declare(strict_types=1);

namespace App\Domain\Documents\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One edit, as it was accepted.
 *
 * The envelope is opaque: this end orders and stores, and what a command means is settled by
 * `commands/envelope.ts` when it parses one against the document's own schemas. That is the
 * whole reason the envelope was built before the feature that needed it.
 *
 * @property string $id
 * @property string $document_id
 * @property int $sequence
 * @property int|null $user_id
 * @property string $origin
 * @property array<string, mixed> $envelope
 * @property Carbon $created_at
 * @property-read User|null $author
 */
class DocumentOperation extends Model
{
    use HasUlids;

    public $timestamps = false;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'user_id' => 'integer',
            'envelope' => 'array',
            'created_at' => 'datetime',
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
        return $this->belongsTo(User::class, 'user_id');
    }
}
