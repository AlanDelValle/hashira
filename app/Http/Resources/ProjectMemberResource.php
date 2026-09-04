<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Projects\Models\ProjectMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of "who has access", for the owner who is deciding whether to keep them.
 *
 * The email is here on purpose. Anybody holding the link can accept it, so the list is the
 * only place an owner can notice somebody they did not mean to let in — and a name on its own
 * does not tell two people apart.
 *
 * @mixin ProjectMember
 */
final class ProjectMemberResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->user->name,
            'email' => $this->user->email,
            'role' => $this->role->value,
            'joinedAt' => $this->joined_at->toIso8601String(),
        ];
    }
}
