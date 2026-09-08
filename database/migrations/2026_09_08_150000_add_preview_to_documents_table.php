<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A picture of the drawing, for the list that chooses between drawings.
 *
 * Base64 PNG in a text column rather than a file on the private disk, and rather than a
 * `bytea`. A file would need a second thing to delete when a project goes — the exact bug
 * `Project::booted` exists to prevent — while a column goes with the row it describes. A
 * `bytea` comes back through Eloquent as a stream, which is a cost paid on every read for a
 * value that is written by a browser and handed straight back to one.
 *
 * **It holds no work.** Every drawing that anybody opens has its picture rewritten, so a
 * preview that is missing, stale or thrown away costs nothing but the next time somebody looks
 * at the drawing. That is why it is not in `documents.data` and needs no schema version: it is
 * derived from the document rather than part of it, the way an export is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->text('preview')->nullable()->after('data');
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('preview');
        });
    }
};
