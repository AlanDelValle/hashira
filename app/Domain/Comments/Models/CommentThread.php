<?php

declare(strict_types=1);

namespace App\Domain\Comments\Models;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use App\Policies\CommentThreadPolicy;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One conversation, at one place on one drawing.
 *
 * The place is a point in drawing millimetres and it does not move. `element_id` records what
 * the pin was dropped on, if anything, so the thread can say that the thing it was about has
 * been deleted — it is never used to reposition the pin.
 *
 * Nothing is mass assignable: every field is set by an action or a controller, which is the
 * same rule the sharing models follow.
 *
 * @property string $id
 * @property string $project_id
 * @property float $x
 * @property float $y
 * @property string|null $element_id
 * @property string|null $opening_comment_id
 * @property Carbon|null $resolved_at
 * @property int|null $resolved_by
 * @property int|null $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User|null $author
 * @property-read User|null $resolver
 */
#[UsePolicy(CommentThreadPolicy::class)]
class CommentThread extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'x' => 'float',
            'y' => 'float',
            'resolved_at' => 'datetime',
            'resolved_by' => 'integer',
            'created_by' => 'integer',
        ];
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * Oldest first: a thread is read the way it was written. The id breaks a tie, so two
     * answers written inside the same millisecond still come back in the same order twice
     * running — which is all a list needs. Which remark *opened* the thread is not an
     * ordering question and `opensWith` answers it.
     *
     * @return HasMany<Comment, $this>
     */
    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'thread_id')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<User, $this> */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    /** Whether this is the remark the pin was dropped for, rather than an answer to it. */
    public function opensWith(Comment $comment): bool
    {
        return $this->opening_comment_id === $comment->id;
    }

    public function isResolved(): bool
    {
        return $this->resolved_at !== null;
    }

    /**
     * Open threads first, then newest — what somebody opening a drawing wants to deal with.
     *
     * @param  Builder<CommentThread>  $query
     */
    public function scopeInReadingOrder(Builder $query): void
    {
        $query->orderByRaw('resolved_at is not null')->latest();
    }
}
