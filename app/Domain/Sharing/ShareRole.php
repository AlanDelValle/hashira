<?php

declare(strict_types=1);

namespace App\Domain\Sharing;

/**
 * What a share link hands out, and what a member of a project holds.
 *
 * One type for both, because they are the same question asked twice: a link says what it is
 * offering, and the row it writes says what somebody took up. Keeping them as one enum is
 * what stops "editor" meaning two subtly different things in two places.
 *
 * The values are the strings already in `share_links.role`, so nothing stored has to move.
 */
enum ShareRole: string
{
    case Viewer = 'viewer';
    case Commenter = 'commenter';
    case Editor = 'editor';

    /**
     * Whether taking this up means signing in.
     *
     * Only viewing is anonymous. Commenting attributes words to somebody and editing changes
     * a drawing under its owner, and neither is a thing to let a URL do on its own — see the
     * Phase 9 decisions in roadmap.md. It is also what keeps non-negotiable rule 6 intact:
     * every write is still authorized by a policy answering about an authenticated user.
     */
    public function requiresAccount(): bool
    {
        return $this !== self::Viewer;
    }

    public function canComment(): bool
    {
        return $this !== self::Viewer;
    }

    public function canEdit(): bool
    {
        return $this === self::Editor;
    }

    /**
     * Ranked, so that accepting a weaker link never takes away access somebody already has.
     * An owner re-issuing a commenter link is inviting more people, not demoting the editor
     * who is already working.
     */
    public function atLeast(self $other): bool
    {
        return $this->rank() >= $other->rank();
    }

    /** How to say it in a sentence about a person. */
    public function label(): string
    {
        return match ($this) {
            self::Viewer => 'can view',
            self::Commenter => 'can comment',
            self::Editor => 'can edit',
        };
    }

    private function rank(): int
    {
        return match ($this) {
            self::Viewer => 0,
            self::Commenter => 1,
            self::Editor => 2,
        };
    }
}
