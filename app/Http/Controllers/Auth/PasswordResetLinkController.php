<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

final class PasswordResetLinkController extends Controller
{
    /**
     * Always answers the same way, whether or not the address is registered. Reporting
     * "no such account" here would turn the form into an account-enumeration oracle.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => __('passwords.sent'),
        ]);
    }
}
