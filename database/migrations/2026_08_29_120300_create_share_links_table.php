<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('share_links', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('project_id')->constrained()->cascadeOnDelete();

            // 32 CSPRNG bytes, base64url encoded. Never derived from an identifier, so a
            // token cannot be guessed from knowing another one.
            $table->string('token', 43)->unique();

            // Only 'viewer' is issued today. The column exists so that adding 'commenter'
            // and 'editor' later is a value change, not a migration of live share links.
            $table->string('role', 16)->default('viewer');

            $table->timestampTz('expires_at')->nullable();

            // Revocation is a timestamp rather than a delete: a leaked link stays auditable.
            $table->timestampTz('revoked_at')->nullable();

            $table->timestampTz('last_viewed_at')->nullable();
            $table->unsignedInteger('view_count')->default(0);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index('project_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('share_links');
    }
};
