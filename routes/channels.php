<?php

declare(strict_types=1);

use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;

/*
 * Who may listen to what.
 *
 * There is one channel, and it is a presence channel: everybody looking at a project can see
 * who else is. Authorization is the same `view` policy every other route asks — a socket is
 * another way into the drawing, not a way around the rules, and non-negotiable rule 6 does not
 * stop applying because the transport changed.
 *
 * What is returned is what every other member of the channel is handed about this person: an
 * id and a name, and nothing else. It is the same shape ProjectPersonResource serves for the
 * same reason — the member list names accounts and belongs to the owner.
 *
 * Cursors do not come through here at all. They are client events, whispered directly between
 * the people already on the channel: a pointer moves tens of times a second, and putting that
 * through PHP would be a queue of work for something that is stale before it is read. The
 * server's whole part in a cursor is having decided, once, who is allowed on the channel.
 */

Broadcast::channel('project.{project}', function (User $user, string $project): ?array {
    $model = Project::query()->find($project);

    if ($model === null || Gate::forUser($user)->denies('view', $model)) {
        return null;
    }

    return ['id' => $user->getKey(), 'name' => $user->name];
});
