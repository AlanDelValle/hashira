<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Accounts\Actions\CloseAccount;
use App\Http\Controllers\Controller;
use App\Http\Requests\Account\DeleteAccountRequest;
use App\Http\Requests\Account\UpdateAccountRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

/**
 * Your own account: the name other people see, and the end of it.
 *
 * Everything here is about the authenticated user and never about a user named in the request.
 * There is no id in any of these routes for that reason — non-negotiable rule 6 says
 * authorization comes from a policy against the authenticated user, and the strongest form of
 * that is a route with nobody else to address.
 */
final class AccountController extends Controller
{
    public function update(UpdateAccountRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /*
         * A name is how somebody appears everywhere at once: on a card that says whose drawing
         * it is, beside a remark, on a cursor moving across a plan, in the list `@` offers.
         * All of those read the row, so this changes what was signed months ago as well as
         * what is signed next — which is the right behaviour for a name and worth knowing.
         */
        $user->update($request->validated());

        return UserResource::make($user)->response();
    }

    public function destroy(DeleteAccountRequest $request, CloseAccount $closeAccount): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Asked before the session is taken down, so that a refusal leaves somebody signed in
        // and able to do the thing it just told them to do.
        $closeAccount->refuseIfAFirmWouldLoseItsLastAdmin($user);

        /*
         * Signed out first, and the order is not a preference.
         *
         * `SessionGuard::logout()` cycles the remember token of anybody who has one, which
         * means saving the user — and Eloquent saves a model whose row has just been deleted by
         * inserting it. Closing the account after signing out worked; closing it before brought
         * the account back, id and all, for every person who had ever ticked "Remember me". A
         * test caught it, which is the only reason this is written down rather than shipped.
         */
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        $closeAccount->handle($user);

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
