<?php

declare(strict_types=1);

namespace App\Domain\Documents\Events;

use App\Domain\Documents\Models\DocumentOperation;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * An edit, on its way to everybody else looking at the drawing.
 *
 * **The POST was the write; this is only delivery.** The operation is already in the log and
 * already has its number by the time this goes out, so a socket that is down costs nobody
 * their work — it costs them seeing it happen. That is the difference between this and a
 * cursor, which has nowhere else to live.
 *
 * `ShouldBroadcastNow` rather than the queued interface, so there is no worker to keep running
 * for an editor to feel live. It is the first thing this application broadcasts from PHP at
 * all: presence needed none, because a cursor is whispered between browsers.
 *
 * It goes out on the project's presence channel, which is the one already authorized by the
 * `view` policy — so being able to hear an edit is the same question as being able to open the
 * drawing, asked once, in one place.
 */
final class OperationApplied implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(
        private readonly string $projectId,
        private readonly DocumentOperation $operation,
    ) {}

    public function broadcastOn(): PresenceChannel
    {
        return new PresenceChannel('project.'.$this->projectId);
    }

    public function broadcastAs(): string
    {
        return 'operation.applied';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'sequence' => $this->operation->sequence,
            'origin' => $this->operation->origin,
            'envelope' => $this->operation->envelope,
        ];
    }
}
