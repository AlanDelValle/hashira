<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How far this drawing's operation log has got.
 *
 * A counter on the document rather than `max(sequence)` over the log, because two edits
 * arriving together must not be handed the same number. Incrementing a column is one
 * statement the database serialises for us; a read-then-write is a race with a name.
 *
 * It is not `revision`, and the two are deliberately different things. `revision` guards a
 * whole-document save — one writer replacing the snapshot. This orders the edits that make up
 * the snapshot, which is what the roadmap said the log would be for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->bigInteger('operation_sequence')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('operation_sequence');
        });
    }
};
