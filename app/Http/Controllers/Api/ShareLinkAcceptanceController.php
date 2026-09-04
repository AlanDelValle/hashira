<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Sharing\Actions\AcceptShareLink;
use App\Domain\Sharing\Models\ShareLink;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Taking up a link that offers more than viewing.
 *
 * Behind `auth`, unlike the endpoint that serves the drawing: this is exactly the step that
 * turns a token into a person, and there is no person to turn it into without an account.
 *
 * It answers with the project, so the client can go straight to it — through the policy, so
 * the reply is proof of access rather than a claim about it.
 */
final class ShareLinkAcceptanceController extends Controller
{
    public function __invoke(Request $request, string $token, AcceptShareLink $accept): ProjectResource
    {
        /** @var User $user */
        $user = $request->user();

        $link = ShareLink::query()->with('project')->where('token', $token)->first();

        // Unknown, revoked, expired, and "this link only offers viewing" all answer the same
        // way, for the same reason the public endpoint does: a caller learns nothing.
        if ($link === null || ! $link->isActive() || ! $link->role->requiresAccount()) {
            throw new NotFoundHttpException;
        }

        $accept->handle($link, $user);

        $project = $link->project->load(['document', 'members', 'owner']);

        Gate::authorize('view', $project);

        return ProjectResource::make($project);
    }
}
