<?php

declare(strict_types=1);

namespace App\Domain\Comments\Actions;

use App\Domain\Comments\Models\Comment;
use App\Domain\Comments\Models\CommentThread;
use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Opening a conversation, which is a place and a first thing said, together.
 *
 * The two are one act and one transaction. A thread with nothing in it is not a remark — it
 * is a pin somebody would find on the drawing with no way to know what it meant, and no
 * interface would ever offer to make one.
 */
final class StartThread
{
    public function handle(
        Project $project,
        User $author,
        float $x,
        float $y,
        string $body,
        ?string $elementId = null,
    ): CommentThread {
        return DB::transaction(function () use ($project, $author, $x, $y, $body, $elementId): CommentThread {
            $thread = new CommentThread;
            $thread->project_id = $project->id;
            $thread->x = $x;
            $thread->y = $y;
            $thread->element_id = $elementId;
            $thread->created_by = (int) $author->getKey();
            $thread->save();

            $comment = new Comment;
            $comment->thread_id = $thread->id;
            $comment->user_id = (int) $author->getKey();
            $comment->body = $body;
            $comment->save();

            // Which remark opened the thread is recorded, not inferred: two rows written in
            // the same millisecond tie on `created_at`, and the tie breaks at random.
            $thread->opening_comment_id = $comment->id;
            $thread->save();

            return $thread->load(['comments.author', 'author']);
        });
    }
}
