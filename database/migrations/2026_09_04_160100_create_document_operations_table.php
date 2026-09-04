<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every edit, in the order it was accepted.
 *
 * This is the log the version comparison deliberately does not read — 9.5 settled that a
 * comparison is computed from two whole documents, because two snapshots a month apart have no
 * operations between them left to replay. This is for ordering *live* edits and for catching
 * somebody up who opened the drawing a minute late.
 *
 * `envelope` is opaque here. The server orders and stores it; it does not understand it. What
 * a command means is decided by `commands/envelope.ts`, which parses it against the document's
 * own schemas on the way out — and a second implementation of that in PHP is precisely what
 * building the envelope once was meant to avoid.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_operations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('document_id')->constrained()->cascadeOnDelete();

            // Dense and monotonic per document: "everything after 41" has to be answerable.
            $table->bigInteger('sequence');

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Which browser sent it, so the sender can skip its own echo. Not the account:
            // two tabs of one person are two editors and should see each other.
            $table->string('origin', 40);

            $table->jsonb('envelope');
            $table->timestampTz('created_at');

            // The one query this table answers, and the guard that no number is used twice.
            $table->unique(['document_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_operations');
    }
};
