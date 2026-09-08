<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Models;

use App\Domain\Organisations\OrganisationRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One person's standing in one organisation.
 *
 * Nothing is mass assignable, for the same reason as `ProjectMember` and `ShareLink`: this is
 * where a stray attribute would hand out access — and here it hands out access to everything
 * the organisation owns rather than to one drawing.
 *
 * @property string $id
 * @property string $organisation_id
 * @property int $user_id
 * @property OrganisationRole $role
 * @property Carbon $joined_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class OrganisationMember extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'role' => OrganisationRole::class,
            'joined_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Organisation, $this> */
    public function organisation(): BelongsTo
    {
        return $this->belongsTo(Organisation::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
