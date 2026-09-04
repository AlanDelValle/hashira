<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Comments\Models\Comment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One thing said.
 *
 * The author is a name and an id and nothing else — no email. Whoever is reading a thread was
 * let into a drawing, which is not the same as being handed the address book of everybody
 * else who was; the owner's member list is where accounts are named, and that stays the
 * owner's.
 *
 * `authorId` is here so the interface can tell whose words are whose without a second
 * request — it is what decides whether a delete control is offered.
 *
 * @mixin Comment
 */
final class CommentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'authorId' => $this->user_id,
            // Null when the account is gone: its words stay, and what that reads as is the
            // interface's sentence to write, not this one's. Same shape as a version's author.
            'authorName' => $this->author?->name,
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
