<?php

declare(strict_types=1);

namespace App\Domain\Comments\Models;

use App\Models\User;
use App\Policies\CommentPolicy;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One thing somebody said in a thread. The first one is the remark; the rest are answers, and
 * nothing distinguishes them beyond their order.
 *
 * @property string $id
 * @property string $thread_id
 * @property int|null $user_id
 * @property string $body
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User|null $author
 */
#[UsePolicy(CommentPolicy::class)]
class Comment extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
        ];
    }

    /** @return BelongsTo<CommentThread, $this> */
    public function thread(): BelongsTo
    {
        return $this->belongsTo(CommentThread::class, 'thread_id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
