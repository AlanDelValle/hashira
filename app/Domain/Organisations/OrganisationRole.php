<?php

declare(strict_types=1);

namespace App\Domain\Organisations;

use App\Domain\Sharing\ShareRole;

/**
 * What somebody holds in an organisation.
 *
 * Two cases, and there is deliberately no third. Billing does not exist yet, and a role
 * invented for it now would be a role with no behaviour — the question of whether an owner has
 * to be distinct from an admin is one to answer when there is something to bill for.
 *
 * It is a separate enum from `ShareRole` on purpose, because they answer different questions.
 * `ShareRole` says what somebody may do to a drawing; this says what they are in a firm.
 * `onProject()` is the one place the two meet, and having it be one place is what stops
 * "member" quietly meaning "editor" in some files and "commenter" in others.
 */
enum OrganisationRole: string
{
    case Admin = 'admin';
    case Member = 'member';

    /**
     * What being in the organisation gets you on the organisation's drawings.
     *
     * Editing, for everybody. What a firm draws belongs to the firm, and an organisation whose
     * members can only look at its own work would have people asking to be let into each
     * project one at a time — which is the thing this is for. Narrowing a particular project is
     * 10.2c's job, and it narrows by writing a row that overrides this.
     */
    public function onProject(): ShareRole
    {
        return ShareRole::Editor;
    }

    /** Whether this role administers the organisation itself, and everything it owns. */
    public function administers(): bool
    {
        return $this === self::Admin;
    }

    /** How to say it in a sentence about a person. */
    public function label(): string
    {
        return match ($this) {
            self::Admin => 'administers',
            self::Member => 'is a member',
        };
    }
}
