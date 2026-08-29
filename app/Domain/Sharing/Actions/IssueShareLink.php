<?php

declare(strict_types=1);

namespace App\Domain\Sharing\Actions;

use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\Models\ShareLink;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class IssueShareLink
{
    /** 32 bytes of entropy, base64url encoded to 43 characters. */
    private const TOKEN_BYTES = 32;

    /**
     * Issue a read-only link, replacing any link the project already had.
     *
     * Replacing rather than accumulating means "share" has one obvious meaning in the UI and
     * revoking is unambiguous: there is never a second live URL a user has forgotten about.
     */
    public function handle(Project $project, User $issuer, ?DateTimeInterface $expiresAt = null): ShareLink
    {
        return DB::transaction(function () use ($project, $issuer, $expiresAt): ShareLink {
            $project->shareLinks()->whereNull('revoked_at')->update(['revoked_at' => now()]);

            $link = new ShareLink;
            $link->token = self::token();
            $link->role = ShareLink::ROLE_VIEWER;
            $link->expires_at = $expiresAt === null ? null : Carbon::instance($expiresAt);
            $link->created_by = $issuer->getKey();
            $link->project()->associate($project);
            $link->save();

            return $link;
        });
    }

    private static function token(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(self::TOKEN_BYTES)), '+/', '-_'), '=');
    }
}
