<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blocks', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('category', 32);

            // The size the block is placed at, in millimetres. Its drawing is normalised, so
            // this is what turns it into something a particular size on a particular plan.
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');

            // The drawing itself, in a normalised 0–1 box: the same primitives the built-in
            // library is written in. See resources/js/editor/assets/library.ts.
            $table->jsonb('draw');

            $table->timestampsTz();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocks');
    }
};
