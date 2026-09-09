<?php

declare(strict_types=1);

namespace App\Domain\Accounts\Actions;

use App\Domain\Organisations\Models\Organisation;
use App\Domain\Projects\Models\Project;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Closing an account, and what that is and is not allowed to take with it.
 *
 * Two things make this more than `$user->delete()`.
 *
 * **A firm must never be left without an admin.** That is the invariant 10.2 defends at every
 * door — demoting, removing and leaving all refuse the last one — and deleting the account is
 * a door nobody had built yet. It is refused here with the same sentence shape, and the way
 * out is the same: make somebody else an admin, or delete the firm.
 *
 * **A database cascade has never deleted a file.** `projects.user_id` cascades, so deleting
 * the row would take every project with it without any model event firing — and `Project`'s
 * `deleting` hook is what removes the underlays from disk. Somebody else's survey left lying
 * in storage after the account that imported it is gone is exactly what that hook exists to
 * prevent, so the projects go through Eloquent first and the cascade finds nothing left to do.
 *
 * What deliberately survives: the firms this person started, because an organisation outlives
 * the account that made it and `created_by` was written to null rather than cascade; their
 * remarks on other people's drawings, which lose their author and keep their words; and every
 * drawing a firm owns, because those were never theirs to take.
 */
final class CloseAccount
{
    public function handle(User $user): void
    {
        $this->refuseIfAFirmWouldLoseItsLastAdmin($user);

        DB::transaction(function () use ($user): void {
            /*
             * One at a time and through the model, so each project takes its underlays off the
             * disk on the way out. `cursor` rather than `get` because this is the one moment
             * an account's whole body of work is in hand at once.
             */
            $user->projects()->cursor()->each(function (Project $project): void {
                $project->delete();
            });

            $user->delete();
        });
    }

    /**
     * Whether this may go ahead at all, asked on its own.
     *
     * `handle` asks it too, so the action is complete wherever it is called from — but the
     * controller has to know before it takes the session down, because a refusal must leave
     * somebody signed in and able to act on what they were told.
     */
    public function refuseIfAFirmWouldLoseItsLastAdmin(User $user): void
    {
        $stranded = $this->firmsLeftWithoutAnAdmin($user);

        if ($stranded->isEmpty()) {
            return;
        }

        $names = $stranded->map(fn (Organisation $firm): string => $firm->name)->join(', ', ' and ');

        throw ValidationException::withMessages([
            'account' => $stranded->count() === 1
                ? "You are the only admin of {$names}. Make somebody else an admin, or delete it, before you close your account."
                : "You are the only admin of {$names}. Make somebody else an admin of each, or delete them, before you close your account.",
        ]);
    }

    /** @return Collection<int, Organisation> */
    private function firmsLeftWithoutAnAdmin(User $user): Collection
    {
        return $user->organisationMemberships()
            ->with('organisation.members')
            ->get()
            ->map(fn ($membership) => $membership->organisation)
            ->filter(fn (?Organisation $firm): bool => $firm !== null && $firm->isLastAdmin($user))
            ->values();
    }
}
