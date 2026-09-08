<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A drawing the firm owns that the firm cannot all open.
 *
 * The default stays what 10.2a decided: what a firm draws belongs to the firm, and everybody in
 * it can open it. This is the exception — the competition entry, the client nobody junior is on
 * — and it is expressed by taking the default away rather than by listing permissions.
 * Restricted, an organisation grants nothing here, and the only way in is the membership row
 * `project_members` has held since 9.4.
 *
 * A timestamp rather than a boolean, like `archived_at` and `revoked_at`: the same state, plus
 * the day somebody decided it, at no extra cost.
 *
 * The check exists because restriction is meaningless on a project one person owns — there is
 * no organisation to withhold it from — and a column that can hold a value nobody can interpret
 * is a column somebody will eventually set.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->timestampTz('restricted_at')->nullable()->after('archived_at');
        });

        DB::statement(
            'ALTER TABLE projects ADD CONSTRAINT projects_restriction_needs_an_organisation
             CHECK (restricted_at IS NULL OR organisation_id IS NOT NULL)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE projects DROP CONSTRAINT projects_restriction_needs_an_organisation');

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('restricted_at');
        });
    }
};
