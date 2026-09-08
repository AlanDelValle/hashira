<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An office, rather than a person.
 *
 * Everything before this assumed one drafter with their own drawings, and a second person only
 * ever arrived through a link to one project. An organisation is the other way somebody gets
 * in: they are in the firm, so they are in the firm's work.
 *
 * Nothing is created here for existing accounts. Somebody working alone never meets the word,
 * which is why `projects.user_id` survives alongside `organisation_id` rather than being
 * replaced by it — see the Phase 10.2 decisions in roadmap.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organisations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 120);

            // Who made it. Nulled rather than cascaded: an organisation outlives the account
            // that opened it, and deleting a founder must not delete the firm's drawings.
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestampsTz();
        });

        Schema::create('organisation_members', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('organisation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // 'admin' or 'member', and there is deliberately no third. A role invented for
            // billing before billing exists is a role with no behaviour.
            $table->string('role', 16);

            $table->timestampTz('joined_at');
            $table->timestampsTz();

            // One row per person per organisation: a role is a state, not a history. The same
            // rule `project_members` follows, for the same reason.
            $table->unique(['organisation_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organisation_members');
        Schema::dropIfExists('organisations');
    }
};
