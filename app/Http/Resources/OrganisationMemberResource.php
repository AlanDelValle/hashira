<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Organisations\Models\OrganisationMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One person in a firm, as an admin deciding about them sees it.
 *
 * The email is here for the same reason it is on `ProjectMemberResource`: a name on its own
 * does not tell two people apart, and this is the list where somebody notices a colleague who
 * left the practice a year ago.
 *
 * @mixin OrganisationMember
 */
final class OrganisationMemberResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->user_id,
            'name' => $this->user->name,
            'email' => $this->user->email,
            'role' => $this->role->value,
            'joinedAt' => $this->joined_at->toIso8601String(),
        ];
    }
}
