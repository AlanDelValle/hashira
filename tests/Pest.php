<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/**
 * Most feature tests need a signed-in owner and someone else to prove cannot reach their
 * work, so both are one call away.
 */
function signedIn(?User $user = null): User
{
    $user ??= User::factory()->create();

    test()->actingAs($user);

    return $user;
}

/**
 * Broadcasting configured, and pointed at a port nothing is listening on.
 *
 * The suite runs with `BROADCAST_CONNECTION=null`, which is why nothing here ever discovers
 * what a real deployment does when the socket is down: `ShouldBroadcastNow` sends inside the
 * request, and a refused connection comes back as an exception in the middle of one. This is
 * the deployment the tests otherwise never see — a self-hosted instance whose Reverb container
 * has stopped.
 *
 * Port 1 refuses immediately rather than hanging, and the timeouts are there so that a machine
 * which decides to hang instead does not take the suite with it.
 */
function broadcastingToNowhere(): void
{
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb' => [
            'driver' => 'reverb',
            'key' => 'nowhere',
            'secret' => 'nowhere',
            'app_id' => 'nowhere',
            'options' => [
                'host' => '127.0.0.1',
                'port' => 1,
                'scheme' => 'http',
                'useTLS' => false,
            ],
            'client_options' => ['connect_timeout' => 1, 'timeout' => 1],
        ],
    ]);
}

/**
 * The drawing as the database really holds it, for every document saved before 2026-09-04 —
 * with the empty strings turned to null by a middleware that had no business inside it.
 *
 * Literal JSON rather than something built here, for the same reason the schema fixtures in
 * model/migration.test.ts are: the point is to hold on to what was actually written, not to
 * what today's code would produce. The client's suite reads the same file, and reads it as a
 * drawing — this side reads it as a row to be repaired.
 *
 * @return array<string, mixed>
 */
function nulledDocument(): array
{
    /** @var array<string, mixed> $document */
    $document = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/nulled-document.json'),
        associative: true,
        flags: JSON_THROW_ON_ERROR,
    );

    return $document;
}
