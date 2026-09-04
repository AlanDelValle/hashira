<?php

declare(strict_types=1);

namespace App\Domain\Projects\Models;

use App\Domain\Comments\Models\CommentThread;
use App\Domain\Documents\Models\Document;
use App\Domain\Sharing\Models\ShareLink;
use App\Domain\Sharing\ShareRole;
use App\Domain\Underlays\Models\Underlay;
use App\Models\User;
use App\Policies\ProjectPolicy;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * A project is what a user names, opens and shares. It owns the drawing rather than being
 * the drawing: the document is a separate row so that a project can grow to several sheets
 * without a migration.
 *
 * @property string $id
 * @property int $user_id
 * @property string $name
 * @property string|null $description
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['name', 'description'])]
#[UseFactory(ProjectFactory::class)]
#[UsePolicy(ProjectPolicy::class)]
class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory;

    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
        ];
    }

    /**
     * Deleting a project takes its underlays' pictures with it.
     *
     * The rows go by themselves — the foreign key cascades — but the files they point at are
     * on disk, and a database cascade has never deleted a file. Somebody else's survey left
     * lying in storage after the project that used it is gone is exactly the thing not to do.
     */
    protected static function booted(): void
    {
        static::deleting(function (self $project): void {
            Storage::deleteDirectory("underlays/{$project->id}");
        });
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /**
     * The MVP works with exactly one document per project. The relation is singular here and
     * plural above so that adding sheets later is additive rather than a rewrite.
     *
     * @return HasOne<Document, $this>
     */
    public function document(): HasOne
    {
        return $this->hasOne(Document::class)->oldestOfMany();
    }

    /**
     * Pages to trace over. They belong to the project rather than to the person: a survey is
     * imported to draw one particular building on top of.
     *
     * @return HasMany<Underlay, $this>
     */
    public function underlays(): HasMany
    {
        return $this->hasMany(Underlay::class);
    }

    /**
     * Everybody here who is not the owner. See ProjectMember: a row is written when somebody
     * signed in accepts a link that carries a role.
     *
     * @return HasMany<ProjectMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    public function isOwnedBy(User $user): bool
    {
        return (int) $this->user_id === (int) $user->getKey();
    }

    /**
     * What this person holds here, or null if they hold nothing. The owner is not a member of
     * their own project and gets null too — ownership is answered by `isOwnedBy`, and keeping
     * the two apart is what stops an owner's access depending on a row existing.
     *
     * Reads a loaded `members` relation when there is one, so listing projects does not turn
     * into a query per card.
     */
    public function memberRole(User $user): ?ShareRole
    {
        return $this->membershipFor($user)?->role;
    }

    /**
     * The row itself, which the interface needs in order to offer somebody the way out: a
     * member leaves by deleting their own membership.
     */
    public function membershipFor(User $user): ?ProjectMember
    {
        return $this->relationLoaded('members')
            ? $this->members->firstWhere('user_id', (int) $user->getKey())
            : $this->members()->where('user_id', $user->getKey())->first();
    }

    /**
     * The conversations on this drawing. They belong to the project rather than to the
     * document, because a remark outlives the revision it was made against — see
     * document-format.md on why nothing about a comment is in `documents.data`.
     *
     * @return HasMany<CommentThread, $this>
     */
    public function commentThreads(): HasMany
    {
        return $this->hasMany(CommentThread::class);
    }

    /** @return HasMany<ShareLink, $this> */
    public function shareLinks(): HasMany
    {
        return $this->hasMany(ShareLink::class);
    }

    /** @return HasOne<ShareLink, $this> */
    public function activeShareLink(): HasOne
    {
        return $this->hasOne(ShareLink::class)->active()->latestOfMany();
    }
}
