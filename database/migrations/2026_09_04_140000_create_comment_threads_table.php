<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A remark made at a place on a drawing.
 *
 * It is a table rather than part of `documents.data` — the decision is in roadmap.md, Phase 9
 * — because a comment is not a thing anybody drew. In the drawing it would be dragged into
 * undo, into every export, into the share payload and into the version comparison, and the
 * document schema would have to move every time the conversation about a plan changed shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_threads', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('project_id')->constrained()->cascadeOnDelete();

            /*
             * Where it points, in storage units: millimetres of drawing, like everything else
             * the document holds. Not integers — a pin is dropped where the pointer was, and
             * the pointer does not stand on whole millimetres.
             */
            $table->double('x');
            $table->double('y');

            /*
             * The element the pin was dropped on, when it was dropped on one. It is not what
             * positions the pin and never moves it: a remark is made at a place on a drawing
             * at a moment, and shifting somebody's words because the geometry under them moved
             * would re-point what they said. What it is for is saying that the thing they were
             * talking about is gone.
             *
             * A plain string rather than a foreign key: elements live in a JSONB column.
             */
            $table->string('element_id', 64)->nullable();

            /*
             * The remark the pin was dropped for, named rather than worked out.
             *
             * It could be inferred as the oldest comment, and that is wrong twice over: two
             * rows written in the same millisecond tie, and ULIDs break the tie at random. It
             * is also the same mistake as deciding which face of a wall is inside from the
             * order it was drawn in — identity from ordering. So the thread says which one.
             *
             * Nullable only because it is written a moment after the row it points at.
             */
            $table->foreignUlid('opening_comment_id')->nullable();

            $table->timestampTz('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            // The editor asks for one project's threads and shows the open ones first.
            $table->index(['project_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_threads');
    }
};
