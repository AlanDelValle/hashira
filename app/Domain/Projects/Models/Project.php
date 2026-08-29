<?php

declare(strict_types=1);

namespace App\Domain\Projects\Models;

use App\Domain\Documents\Models\Document;
use App\Domain\Sharing\Models\ShareLink;
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
