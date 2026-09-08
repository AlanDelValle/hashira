<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * An offer to join a firm, made to an address rather than to an account.
 *
 * The address is the point. Somebody being asked to join may not have an account yet, and
 * requiring one first would mean an admin telling a colleague to go and register before they
 * can be invited — which is the moment most people stop.
 *
 * It is the same shape as a share link and for the same reason: a token is read once, at the
 * door, and what it writes is a membership row. From then on every policy reads the row and
 * the token is never consulted again. What is different is that this one is addressed — the
 * token alone is not enough, the signed-in account's email has to match it, so a forwarded
 * invitation admits the person it was written to and nobody else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organisation_invitations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('organisation_id')->constrained()->cascadeOnDelete();

            // Stored lowercased, because an invitation to Ana@… and one to ana@… are the same
            // invitation and nobody thinks otherwise.
            $table->string('email');

            $table->string('role', 16);

            // 32 random bytes, base64url — the same as `share_links.token`.
            $table->char('token', 43)->unique();

            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('revoked_at')->nullable();
            $table->timestampsTz();

            // Somebody looking for what they were offered searches by their own address.
            $table->index('email');
        });

        /*
         * One open invitation per address per firm. Partial, because an accepted or revoked one
         * is history and inviting somebody again after they left has to be possible — a plain
         * unique index would make the second invitation impossible for ever.
         */
        DB::statement(
            'CREATE UNIQUE INDEX organisation_invitations_open
             ON organisation_invitations (organisation_id, email)
             WHERE accepted_at IS NULL AND revoked_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('organisation_invitations');
    }
};
