<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Somebody who can be mentioned: a name and an id, and deliberately nothing else.
 *
 * Its own class rather than a lighter mode of ProjectMemberResource, for the reason
 * SharedDocumentResource is its own class: a field added for the owner's member list must not
 * be able to leak into a payload everybody on the project can read. The member list names
 * accounts, and that stays the owner's.
 *
 * @mixin User
 */
final class ProjectPersonResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
        ];
    }
}
