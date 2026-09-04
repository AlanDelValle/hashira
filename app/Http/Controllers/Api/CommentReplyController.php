<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Comments\Models\Comment;
use App\Domain\Comments\Models\CommentThread;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCommentReplyRequest;
use App\Http\Resources\CommentResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Answering, and taking an answer back.
 *
 * Replying to a resolved thread is allowed on purpose. "That is not quite right" is exactly
 * the thing somebody needs to say about a point that was closed too early, and a conversation
 * that cannot be reopened by talking is one people work around by starting a second pin at
 * the same place.
 */
final class CommentReplyController extends Controller
{
    public function store(
        StoreCommentReplyRequest $request,
        Project $project,
        CommentThread $thread,
    ): JsonResponse {
        $this->belongsTo($project, $thread);

        Gate::authorize('comment', $project);

        /** @var User $user */
        $user = $request->user();

        $comment = new Comment;
        $comment->thread_id = $thread->id;
        $comment->user_id = (int) $user->getKey();
        $comment->body = trim((string) $request->validated('body'));
        $comment->save();

        return CommentResource::make($comment->load('author'))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * The first comment cannot be removed on its own: it is the remark the pin was dropped
     * for, and a thread whose opening line is gone is a place on a drawing with answers to a
     * question nobody can read. Deleting that means deleting the thread.
     */
    public function destroy(Project $project, CommentThread $thread, Comment $comment): JsonResponse
    {
        $this->belongsTo($project, $thread);

        if ($comment->thread_id !== $thread->id) {
            throw new NotFoundHttpException;
        }

        Gate::authorize('comment', $project);
        Gate::authorize('delete', $comment);

        if ($thread->opensWith($comment)) {
            return response()->json(
                ['message' => 'Delete the whole thread rather than the remark it started with.'],
                Response::HTTP_CONFLICT,
            );
        }

        $comment->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    private function belongsTo(Project $project, CommentThread $thread): void
    {
        if ($thread->project_id !== $project->id) {
            throw new NotFoundHttpException;
        }
    }
}
