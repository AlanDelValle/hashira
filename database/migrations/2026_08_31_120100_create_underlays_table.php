<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('underlays', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('project_id')->constrained()->cascadeOnDelete();
            $table->string('name', 160);

            // Which page of the original document this came from, for saying so in the UI.
            $table->unsignedSmallInteger('page')->default(1);

            // The page's own size in millimetres, so the drawing can be placed at true size.
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');

            // The rasterised page on the private disk. The PDF itself is not kept: what the
            // editor traces over is the picture, and holding the original as well would be
            // storing somebody's survey twice.
            $table->string('path', 255);
            $table->unsignedInteger('bytes');

            $table->timestampsTz();

            $table->index('project_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('underlays');
    }
};
