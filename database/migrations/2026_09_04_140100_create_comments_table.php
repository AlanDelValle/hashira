<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What was actually said. A thread holds the place; these hold the words.
 *
 * Split from `comment_threads` so the anchor is written once. A reply is not a second remark
 * about a second place — it is the same place, answered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('thread_id')->constrained('comment_threads')->cascadeOnDelete();

            /*
             * Nulled rather than cascaded when an account goes: deleting somebody must not
             * take the other half of a conversation with it. What is left reads as written by
             * a former collaborator, which is what happened.
             */
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->text('body');
            $table->timestampsTz();

            // A thread is always read whole, oldest first.
            $table->index(['thread_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comments');
    }
};
