<?php

declare(strict_types=1);

namespace App\Domain\Comments\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One person, named in one remark.
 *
 * @property string $id
 * @property string $comment_id
 * @property int|null $user_id
 * @property string $text
 * @property Carbon|null $read_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User|null $user
 */
class CommentMention extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'read_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Comment, $this> */
    public function comment(): BelongsTo
    {
        return $this->belongsTo(Comment::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Not seen yet. A mention is its own notification, so this is the whole of an inbox.
     *
     * @param  Builder<CommentMention>  $query
     */
    public function scopeUnread(Builder $query): void
    {
        $query->whereNull('read_at');
    }
}
