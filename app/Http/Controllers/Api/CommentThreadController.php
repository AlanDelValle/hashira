<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Comments\Actions\StartThread;
use App\Domain\Comments\Models\CommentThread;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCommentThreadRequest;
use App\Http\Requests\UpdateCommentThreadRequest;
use App\Http\Resources\CommentThreadResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Conversations on a drawing.
 *
 * Reading them needs `view` and writing one needs `comment`, so an editor and a commenter can
 * both take part while somebody who was only shown the drawing cannot. Both are answered by
 * `ProjectPolicy` against the account, never against anything in the request.
 */
final class CommentThreadController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);

        return CommentThreadResource::collection(
            $project->commentThreads()
                ->with(['comments.author', 'comments.mentions.user', 'author'])
                ->inReadingOrder()
                ->get(),
        );
    }

    public function store(
        StoreCommentThreadRequest $request,
        Project $project,
        StartThread $start,
    ): JsonResponse {
        Gate::authorize('comment', $project);

        /** @var User $user */
        $user = $request->user();

        $thread = $start->handle(
            project: $project,
            author: $user,
            x: (float) $request->validated('x'),
            y: (float) $request->validated('y'),
            body: trim((string) $request->validated('body')),
            elementId: $request->validated('elementId'),
        );

        return CommentThreadResource::make($thread)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /** Resolving, or putting one back. */
    public function update(
        UpdateCommentThreadRequest $request,
        Project $project,
        CommentThread $thread,
    ): CommentThreadResource {
        $this->belongsTo($project, $thread);

        Gate::authorize('comment', $project);
        Gate::authorize('resolve', $thread);

        /** @var User $user */
        $user = $request->user();

        $resolved = (bool) $request->validated('resolved');

        $thread->resolved_at = $resolved ? now() : null;
        $thread->resolved_by = $resolved ? (int) $user->getKey() : null;
        $thread->save();

        return CommentThreadResource::make(
            $thread->load(['comments.author', 'comments.mentions.user', 'author']),
        );
    }

    public function destroy(Project $project, CommentThread $thread): JsonResponse
    {
        $this->belongsTo($project, $thread);

        Gate::authorize('comment', $project);
        Gate::authorize('delete', $thread);

        $thread->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * A thread reached through the wrong project is not a thread anybody may act on, and
     * saying so as 404 keeps the id from confirming anything.
     */
    private function belongsTo(Project $project, CommentThread $thread): void
    {
        if ($thread->project_id !== $project->id) {
            throw new NotFoundHttpException;
        }
    }
}
