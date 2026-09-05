<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether the person named has seen it.
 *
 * A column on the row that already records who was named, rather than a notifications table
 * beside it. A mention *is* the notification — inventing a second row to point at the first
 * would mean two things to keep in step and two answers to "was I asked about this".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comment_mentions', function (Blueprint $table) {
            $table->timestampTz('read_at')->nullable();

            // "What have I not seen yet", which is the only question this column answers.
            $table->index(['user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::table('comment_mentions', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'read_at']);
            $table->dropColumn('read_at');
        });
    }
};
