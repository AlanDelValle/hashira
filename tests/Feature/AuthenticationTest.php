<?php

declare(strict_types=1);

use App\Models\User;

it('registers a user and signs them in', function (): void {
    $this->postJson('/api/register', [
        'name' => 'Ada',
        'email' => 'ada@example.test',
        'password' => 'drafting-table',
        'password_confirmation' => 'drafting-table',
    ])->assertCreated()->assertJsonPath('data.email', 'ada@example.test');

    $this->assertAuthenticated();
    $this->getJson('/api/user')->assertOk()->assertJsonPath('data.name', 'Ada');
});

it('never returns the password hash', function (): void {
    $response = $this->postJson('/api/register', [
        'name' => 'Ada',
        'email' => 'ada@example.test',
        'password' => 'drafting-table',
        'password_confirmation' => 'drafting-table',
    ]);

    expect($response->json('data'))->toHaveKeys(['id', 'name', 'email'])
        ->and($response->json('data'))->not->toHaveKey('password');
});

it('signs in with the right credentials', function (): void {
    User::factory()->create(['email' => 'ada@example.test', 'password' => 'drafting-table']);

    $this->postJson('/api/login', [
        'email' => 'ada@example.test',
        'password' => 'drafting-table',
    ])->assertOk();

    $this->assertAuthenticated();
});

it('rejects the wrong password without saying which field was wrong', function (): void {
    User::factory()->create(['email' => 'ada@example.test', 'password' => 'drafting-table']);

    $this->postJson('/api/login', [
        'email' => 'ada@example.test',
        'password' => 'wrong',
    ])->assertUnprocessable()->assertJsonValidationErrors('email');

    $this->assertGuest();
});

it('signs out', function (): void {
    signedIn();

    $this->postJson('/api/logout')->assertNoContent();

    $this->assertGuest();
});

it('answers the same way whether or not a reset address is registered', function (): void {
    User::factory()->create(['email' => 'known@example.test']);

    $known = $this->postJson('/api/forgot-password', ['email' => 'known@example.test']);
    $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.test']);

    expect($known->status())->toBe($unknown->status())
        ->and($known->json('message'))->toBe($unknown->json('message'));
});
