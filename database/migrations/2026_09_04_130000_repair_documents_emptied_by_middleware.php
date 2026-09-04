<?php

declare(strict_types=1);

use App\Domain\Documents\EmptiedStrings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Put back the empty strings that were saved as null.
 *
 * Every drawing saved before 2026-09-04 went through Laravel's global
 * ConvertEmptyStringsToNull on the way in, which reached inside the document and emptied
 * fields it had no business reading. `App\Domain\Documents\EmptiedStrings` says which fields
 * and why; this walks what was already written with it.
 *
 * Snapshots are repaired alongside the drawings. A version is meant to be exactly what was
 * saved, and this is what was saved: restoring a version should not be a way of losing a
 * label again.
 *
 * Nothing else on the row is touched. `revision` stays where it is, so a tab that has the
 * drawing open can still save; `updated_at` stays where it is, because a repair is not
 * activity and the dashboard orders projects by it.
 */
return new class extends Migration
{
    /** Documents are megabytes at the ceiling, so they are read a few at a time. */
    private const CHUNK = 100;

    public function up(): void
    {
        foreach (['documents', 'document_versions'] as $table) {
            DB::table($table)->select('id', 'data')->chunkById(self::CHUNK, function ($rows) use ($table): void {
                foreach ($rows as $row) {
                    $this->repair($table, (string) $row->id, (string) $row->data);
                }
            });
        }
    }

    /**
     * Deliberately irreversible.
     *
     * Rolling this back would mean writing the nulls in again, and the whole point is that
     * they were never anything anybody meant.
     */
    public function down(): void
    {
        //
    }

    private function repair(string $table, string $id, string $json): void
    {
        $data = json_decode($json, true);

        if (! is_array($data)) {
            return;
        }

        /** @var array<string, mixed> $data */
        $repaired = EmptiedStrings::restoredIn($data);

        if ($repaired === $data) {
            return;
        }

        DB::table($table)
            ->where('id', $id)
            ->update(['data' => json_encode($repaired, JSON_THROW_ON_ERROR)]);
    }
};
