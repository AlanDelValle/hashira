<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A project's owner becomes one of two things.
 *
 * **This adds and never moves.** Every row already here is already correct: it has a
 * `user_id`, and that goes on meaning what it meant. Only a project created into an
 * organisation leaves it null.
 *
 * Two nullable columns and a check rather than the polymorphic pair Laravel would offer.
 * `morphTo` wants one column and a type string, and that column has to be text, because users
 * are `bigint` and organisations are ULIDs — which makes it a foreign key nobody enforces.
 * Deleting an account already takes its projects with it, and losing that to a naming
 * convention would be a poor trade. Two real foreign keys cascade; a check keeps exactly one
 * of them filled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->foreignUlid('organisation_id')
                ->nullable()
                ->after('user_id')
                ->constrained()
                ->cascadeOnDelete();

            // The list a person sees is "mine, plus my organisations'", so both sides of that
            // are indexed the same way.
            $table->index(['organisation_id', 'updated_at']);
        });

        // Nullable only now that something else can carry ownership. Doing it in its own
        // statement keeps the change legible in a way a fluent `->change()` chain does not.
        DB::statement('ALTER TABLE projects ALTER COLUMN user_id DROP NOT NULL');

        // The thing that makes "one of two" true rather than merely intended. Without it the
        // states that cannot be reasoned about — a project owned by nobody, or by both — are
        // one bad insert away, and no amount of care in PHP closes that.
        DB::statement(
            'ALTER TABLE projects ADD CONSTRAINT projects_one_owner
             CHECK (num_nonnulls(user_id, organisation_id) = 1)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE projects DROP CONSTRAINT projects_one_owner');

        // Anything an organisation owns has no user to fall back to, so it cannot survive the
        // column going away. Going back means going back to before organisations existed.
        DB::table('projects')->whereNull('user_id')->delete();

        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['organisation_id', 'updated_at']);
            $table->dropConstrainedForeignId('organisation_id');
        });

        DB::statement('ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL');
    }
};
