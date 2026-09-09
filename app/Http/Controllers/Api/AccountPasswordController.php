<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Account\UpdatePasswordRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Changing the password of the account you are signed in to.
 *
 * Its own controller rather than a second method on the account, because it is a different act
 * from renaming yourself and asks a different thing of you — and because the codebase already
 * separates a concern per controller where the gate differs, as restriction and archiving do
 * on a project.
 *
 * Not to be confused with `Auth\NewPasswordController`, which is the end of the reset flow:
 * that one is reached by a token from an inbox and by somebody who is not signed in.
 */
final class AccountPasswordController extends Controller
{
    public function update(UpdatePasswordRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $user->update(['password' => $request->validated('password')]);

        /*
         * The session is left standing. Signing every other device out is the safer default and
         * needs `AuthenticateSession` in the middleware stack to do honestly — without it, a
         * password change quietly leaves other sessions alive while appearing not to. Building
         * half of that is worse than not claiming it, so this claims nothing.
         */
        return response()->json(status: 204);
    }
}
