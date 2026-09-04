<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who a remark was aimed at.
 *
 * A row rather than a re-scan of the body at read time, because the roster changes: somebody
 * removed from a project tomorrow was still addressed today, and a comment is a record of what
 * was said. `text` is what was actually typed, kept so that highlighting cannot quietly
 * rewrite last month's conversation when a person renames their account.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_mentions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('comment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('text', 160);
            $table->timestampsTz();

            // Being addressed twice in one remark is being addressed once.
            $table->unique(['comment_id', 'user_id']);

            // "What was I asked about", which is the question a notification will ask.
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_mentions');
    }
};
