<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who else is in a project, besides the person who owns it.
 *
 * Until now `projects.user_id` was the whole of access. A row here is the second person, and
 * accepting a share link is what writes one — so the token is consulted once, at the door,
 * and every authorization afterwards reads this table instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_members', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // 'commenter' or 'editor'. Viewing is never recorded: an anonymous link is the
            // whole of it, so there is nobody to write down.
            $table->string('role', 16);

            // Which link let this person in, kept so the owner can see it. Nulled rather than
            // cascaded because membership outlives the link that granted it — re-issuing a
            // link must not quietly evict the people already inside.
            $table->foreignUlid('share_link_id')->nullable()->constrained()->nullOnDelete();

            $table->timestampTz('joined_at');
            $table->timestampsTz();

            // One row per person per project: a role is a state, not a history.
            $table->unique(['project_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_members');
    }
};
