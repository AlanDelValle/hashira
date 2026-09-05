<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Comments\Models\CommentMention;
use App\Http\Controllers\Controller;
use App\Http\Resources\MentionResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The remarks you were named in.
 *
 * There is no policy here and there does not need to be one: every query is filtered by the
 * authenticated user's own id, so the question "may I see this" cannot arise — there is
 * nothing else in scope to see. A mention belonging to somebody else is not refused, it is
 * simply not found.
 */
final class MentionController extends Controller
{
    /** A menu, not an archive. Older ones are found by opening the drawing they are on. */
    private const LIMIT = 20;

    public function index(Request $request): AnonymousResourceCollection
    {
        return MentionResource::collection(
            $this->mine($request)
                ->unread()
                ->with(['comment.author', 'comment.thread.project'])
                ->latest()
                ->limit(self::LIMIT)
                ->get(),
        );
    }

    /** Marking one as read, or all of them. */
    public function update(Request $request, ?string $mention = null): JsonResponse
    {
        if ($mention === null) {
            $this->mine($request)->unread()->update(['read_at' => now()]);

            return response()->json(status: Response::HTTP_NO_CONTENT);
        }

        $row = $this->mine($request)->whereKey($mention)->first()
            ?? throw new NotFoundHttpException;

        $row->read_at ??= now();
        $row->save();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** @return Builder<CommentMention> */
    private function mine(Request $request): Builder
    {
        /** @var User $user */
        $user = $request->user();

        return CommentMention::query()->where('user_id', $user->getKey());
    }
}
