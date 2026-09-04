<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Comments\Models\Comment;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Words belong to whoever wrote them. The project's owner can also remove one, because a
 * drawing they are responsible for should not be able to carry something they cannot take
 * off it.
 */
final class CommentPolicy
{
    public function delete(User $user, Comment $comment): Response
    {
        if ($comment->user_id === (int) $user->getKey()) {
            return Response::allow();
        }

        return $comment->thread->project->isOwnedBy($user)
            ? Response::allow()
            : Response::deny('Only the person who wrote this, or the owner, can delete it.');
    }
}
