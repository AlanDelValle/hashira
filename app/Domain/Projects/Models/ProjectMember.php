<?php

declare(strict_types=1);

namespace App\Domain\Projects\Models;

use App\Domain\Sharing\Models\ShareLink;
use App\Domain\Sharing\ShareRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One person's standing in one project.
 *
 * It lives in the Projects domain rather than in Sharing, even though a share link is the
 * only thing that writes one today: what it records is who may do what here, which outlasts
 * whichever mechanism admitted them. Phase 10's teams will write these rows by another route
 * and nothing that reads them should have to change.
 *
 * Nothing is mass assignable, for the same reason as ShareLink: this is where a stray
 * attribute would hand out access.
 *
 * @property string $id
 * @property string $project_id
 * @property int $user_id
 * @property ShareRole $role
 * @property string|null $share_link_id
 * @property Carbon $joined_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class ProjectMember extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'role' => ShareRole::class,
            'joined_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The link this person came in through, kept for the audit.
     *
     * @return BelongsTo<ShareLink, $this>
     */
    public function shareLink(): BelongsTo
    {
        return $this->belongsTo(ShareLink::class);
    }
}
