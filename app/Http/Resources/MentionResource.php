<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Comments\Models\CommentMention;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A remark somebody was named in, as they see it before they have opened it.
 *
 * Enough to decide whether to go: who said it, roughly what, and which drawing it is on. The
 * body is sent whole rather than cut here — where a line ends is a question about the width of
 * a menu, and the server does not know that.
 *
 * @mixin CommentMention
 */
final class MentionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $comment = $this->comment;
        $thread = $comment->thread;

        return [
            'id' => $this->id,
            'body' => $comment->body,
            'authorName' => $comment->author?->name,
            'createdAt' => $comment->created_at->toIso8601String(),
            'read' => $this->read_at !== null,
            'projectId' => $thread->project_id,
            'projectName' => $thread->project->name,
            'threadId' => $thread->id,
        ];
    }
}
