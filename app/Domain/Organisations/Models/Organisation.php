<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Models;

use App\Domain\Organisations\OrganisationRole;
use App\Domain\Projects\Models\Project;
use App\Models\User;
use App\Policies\OrganisationPolicy;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * An office. The other way a person gets to a drawing.
 *
 * A project belongs to one of these or to a user, never to both and never to neither — the
 * database says so with a check constraint rather than trusting this code to remember.
 *
 * @property string $id
 * @property string $name
 * @property int|null $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['name'])]
#[UsePolicy(OrganisationPolicy::class)]
class Organisation extends Model
{
    use HasUlids;

    /** @return BelongsTo<User, $this> */
    public function founder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<OrganisationMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(OrganisationMember::class);
    }

    /** @return HasMany<OrganisationInvitation, $this> */
    public function invitations(): HasMany
    {
        return $this->hasMany(OrganisationInvitation::class);
    }

    /** @return HasMany<Project, $this> */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /**
     * What this person holds here, or null if they are not in it.
     *
     * Reads a loaded `members` relation when there is one, so listing an organisation's
     * projects does not become a query per card — the same rule `Project::memberRole` follows.
     */
    public function roleFor(User $user): ?OrganisationRole
    {
        return $this->membershipFor($user)?->role;
    }

    /**
     * Whether this person is the only admin left.
     *
     * The invariant everything about membership has to defend: a firm with no admin is a firm
     * nobody can rename, invite into, or delete — its drawings are reachable and its
     * administration is not. It is the one state from which there is no way back through the
     * interface, so it is refused at every door that leads to it: demoting, removing, leaving.
     */
    public function isLastAdmin(User $user): bool
    {
        if ($this->roleFor($user)?->administers() !== true) {
            return false;
        }

        return $this->members()
            ->where('role', OrganisationRole::Admin->value)
            ->where('user_id', '!=', $user->getKey())
            ->doesntExist();
    }

    public function membershipFor(User $user): ?OrganisationMember
    {
        return $this->relationLoaded('members')
            ? $this->members->firstWhere('user_id', (int) $user->getKey())
            : $this->members()->where('user_id', $user->getKey())->first();
    }

    /**
     * Everybody in it, for the list somebody can mention on one of its drawings.
     *
     * @return Collection<int, User>
     */
    public function people(): Collection
    {
        /** @var Collection<int, User> */
        return $this->loadMissing('members.user')->members
            ->map(fn (OrganisationMember $member): ?User => $member->user)
            ->filter()
            ->values();
    }
}
