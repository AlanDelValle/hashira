<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Comments\Models\CommentThread;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;

/**
 * What may be done to a conversation, once its project has already let somebody in.
 *
 * Everything here assumes the project's own `comment` ability has been checked first: these
 * answer the narrower question of who may act on this particular thread. Reaching a thread at
 * all is a project question, and `ProjectPolicy` is where that is answered.
 */
final class CommentThreadPolicy
{
    /**
     * Resolving is not an owner's privilege. A thread is resolved by whoever established that
     * the point has been dealt with, which is as often the person who raised it as the person
     * who acted on it — and anybody who can be wrong about that can also reopen it.
     */
    public function resolve(User $user, CommentThread $thread): Response
    {
        return Gate::forUser($user)->allows('comment', $thread->project)
            ? Response::allow()
            : Response::deny('You cannot comment on this drawing.');
    }

    /**
     * Deleting takes the whole conversation, including other people's answers, so it is kept
     * to the two people entitled to that: whoever started it, and whoever owns the drawing.
     */
    public function delete(User $user, CommentThread $thread): Response
    {
        if ($thread->created_by === (int) $user->getKey()) {
            return Response::allow();
        }

        return $thread->project->isOwnedBy($user)
            ? Response::allow()
            : Response::deny('Only the person who started this thread, or the owner, can delete it.');
    }
}
