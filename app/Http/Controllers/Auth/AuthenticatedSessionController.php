<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

final class AuthenticatedSessionController extends Controller
{
    public function store(LoginRequest $request): UserResource
    {
        $request->authenticate();

        // A fresh session id on privilege change closes session fixation.
        $request->session()->regenerate();

        /** @var User $user */
        $user = $request->user();

        return UserResource::make($user);
    }

    public function destroy(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
