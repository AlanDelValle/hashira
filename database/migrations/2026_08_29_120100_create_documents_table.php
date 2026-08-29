<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('project_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->unsignedSmallInteger('schema_version');

            // Optimistic concurrency: incremented on every write. A client saving against a
            // stale revision is rejected with 409 rather than silently overwriting whatever
            // another tab or device wrote in the meantime.
            $table->unsignedInteger('revision')->default(0);

            // The drawing itself. See docs/document-format.md.
            $table->jsonb('data');

            $table->timestampsTz();

            $table->index('project_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
