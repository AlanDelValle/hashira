<?php

declare(strict_types=1);

namespace App\Policies;

use App\Domain\Blocks\Models\Block;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * A block belongs to whoever made it. As with a project, a denial is reported as 404: holding
 * someone else's id should not be enough to learn that it exists.
 */
final class BlockPolicy
{
    public function delete(User $user, Block $block): Response
    {
        return $user->getKey() === $block->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
