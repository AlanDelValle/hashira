<?php

declare(strict_types=1);

namespace App\Domain\Comments\Events;

use App\Domain\Comments\Models\CommentMention;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Somebody was named in a remark.
 *
 * On a channel of their own rather than the project's, because the whole point of a mention is
 * reaching somebody who is *not* looking at the drawing. Had they been on the project channel,
 * they would have seen the comment arrive anyway.
 *
 * The row is written first and this only carries the news, exactly as an operation is logged
 * before it is broadcast: a socket that is down costs somebody a nudge, never the mention.
 * They find it the next time they look, because the mention *is* the record.
 */
final class MentionReceived implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(private readonly CommentMention $mention) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('user.'.$this->mention->user_id);
    }

    public function broadcastAs(): string
    {
        return 'mention.received';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['id' => $this->mention->id];
    }
}
