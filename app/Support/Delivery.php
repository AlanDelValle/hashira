<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Support\Facades\Log;

/**
 * Sending news of something that is already recorded.
 *
 * Both things this application broadcasts are written before they go out: an edit is in the
 * operation log with its number, and a mention is a row of its own. So the send is delivery
 * and nothing else, and it is allowed to fail — what it costs is somebody seeing the change
 * happen, never the change.
 *
 * That is not what happened without this. Both events are `ShouldBroadcastNow`, chosen so an
 * editor feels live without a queue worker running, which means the HTTP call to Reverb
 * happens inside the request: a socket that is down turned a saved edit into a 500, and — the
 * worse one — rolled a mention back out of the comment it belonged to, because `AddComment`
 * dispatches inside its transaction. A self-hosted instance whose socket container has
 * stopped is not an exotic state, it is Tuesday.
 *
 * **It catches `BroadcastException` and nothing wider.** That is the one the framework raises
 * when a broadcaster cannot deliver — an unreachable host, a refused connection, an app id the
 * server does not know. A bad channel name or an unserialisable payload is a bug in this
 * repository rather than weather, and it should still be loud.
 */
final class Delivery
{
    /**
     * Try to deliver, and carry on if the socket will not take it.
     *
     * @param  callable(): mixed  $send
     */
    public static function attempt(callable $send): void
    {
        try {
            $send();
        } catch (BroadcastException $exception) {
            Log::warning('Nobody was told; the record itself is safe.', [
                'reason' => $exception->getMessage(),
            ]);
        }
    }
}
