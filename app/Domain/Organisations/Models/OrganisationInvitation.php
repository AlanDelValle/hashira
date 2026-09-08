<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Models;

use App\Domain\Organisations\OrganisationRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An open offer to join a firm.
 *
 * Nothing is mass assignable, for the same reason as `ShareLink` and `OrganisationMember`:
 * this is where a stray attribute would hand out access to everything a firm owns.
 *
 * @property string $id
 * @property string $organisation_id
 * @property string $email
 * @property OrganisationRole $role
 * @property string $token
 * @property int|null $invited_by
 * @property Carbon|null $expires_at
 * @property Carbon|null $accepted_at
 * @property Carbon|null $revoked_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class OrganisationInvitation extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'role' => OrganisationRole::class,
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /** The acceptance route binds on the token, never on the identifier. */
    public function getRouteKeyName(): string
    {
        return 'token';
    }

    /** @return BelongsTo<Organisation, $this> */
    public function organisation(): BelongsTo
    {
        return $this->belongsTo(Organisation::class);
    }

    /** @return BelongsTo<User, $this> */
    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    /**
     * Neither accepted, revoked nor expired — the only state in which it does anything.
     *
     * @param  Builder<OrganisationInvitation>  $query
     */
    public function scopeOpen(Builder $query): void
    {
        $query->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    public function isOpen(): bool
    {
        return $this->accepted_at === null
            && $this->revoked_at === null
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    /**
     * Whether this is addressed to this person.
     *
     * The token is not the whole of it. An invitation is written to an address, so a forwarded
     * link admits the person it was written to and nobody else — which is the difference
     * between inviting somebody and publishing a way in.
     */
    public function addresses(User $user): bool
    {
        return mb_strtolower($this->email) === mb_strtolower($user->email);
    }
}
