<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class AuthenticatedUserController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // The status is set rather than inferred: a resource left to decide for itself
        // answers 201 when it happens to wrap a model created earlier in the same process,
        // which is never right for a read.
        return UserResource::make($user)
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }
}
