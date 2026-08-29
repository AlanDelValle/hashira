<?php

declare(strict_types=1);

namespace App\Domain\Sharing\Models;

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A capability URL granting read-only access to one project's drawing.
 *
 * Nothing here is mass assignable: every field is set by an action, because a share link is
 * the one place where a stray attribute would hand out access.
 *
 * @property string $id
 * @property string $project_id
 * @property string $token
 * @property string $role
 * @property Carbon|null $expires_at
 * @property Carbon|null $revoked_at
 * @property Carbon|null $last_viewed_at
 * @property int $view_count
 * @property int|null $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class ShareLink extends Model
{
    use HasUlids;

    public const ROLE_VIEWER = 'viewer';

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_viewed_at' => 'datetime',
            'view_count' => 'integer',
        ];
    }

    /** Public routes bind on the token, never on the identifier. */
    public function getRouteKeyName(): string
    {
        return 'token';
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<User, $this> */
    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Neither revoked nor expired.
     *
     * @param  Builder<ShareLink>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('revoked_at')
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }
}
