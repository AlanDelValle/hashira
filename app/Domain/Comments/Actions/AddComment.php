<?php

declare(strict_types=1);

namespace App\Domain\Comments\Actions;

use App\Domain\Comments\Events\MentionReceived;
use App\Domain\Comments\Mentions;
use App\Domain\Comments\Models\Comment;
use App\Domain\Comments\Models\CommentMention;
use App\Domain\Comments\Models\CommentThread;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Saying one thing, and writing down who it was aimed at.
 *
 * Used for the remark a thread opens with and for every answer after it, because they are the
 * same act — nothing distinguishes them but their order. Keeping mention resolution here means
 * a reply cannot quietly address nobody while an opening remark does.
 */
final class AddComment
{
    public function handle(CommentThread $thread, User $author, string $body): Comment
    {
        return DB::transaction(function () use ($thread, $author, $body): Comment {
            $comment = new Comment;
            $comment->thread_id = $thread->id;
            $comment->user_id = (int) $author->getKey();
            $comment->body = $body;
            $comment->save();

            foreach (Mentions::in($body, $thread->project->people()) as $mention) {
                $row = new CommentMention;
                $row->comment_id = $comment->id;
                $row->user_id = (int) $mention['user']->getKey();
                $row->text = $mention['text'];
                $row->save();

                // The row is the record; this is only the nudge. A socket that is down costs
                // somebody the nudge and never the mention.
                MentionReceived::dispatch($row);
            }

            return $comment->load(['author', 'mentions.user']);
        });
    }
}
