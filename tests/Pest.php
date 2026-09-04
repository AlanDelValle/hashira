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
