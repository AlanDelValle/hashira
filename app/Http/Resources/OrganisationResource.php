<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Organisations\Models\Organisation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Organisation
 */
final class OrganisationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var User|null $user */
        $user = $request->user();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'createdAt' => $this->created_at->toIso8601String(),

            /*
             * What the person asking holds here — 'admin' or 'member'. The interface offers
             * renaming and deleting from this and nothing else, which keeps the one answer in
             * one place rather than having the client work it out from a member list.
             */
            'role' => $user === null ? null : $this->roleFor($user)?->value,

            'memberCount' => $this->whenLoaded('members', fn () => $this->members->count()),
        ];
    }
}
