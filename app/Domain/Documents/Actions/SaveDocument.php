<?php

declare(strict_types=1);

namespace App\Domain\Documents\Actions;

use App\Domain\Documents\Exceptions\StaleRevisionException;
use App\Domain\Documents\Models\Document;
use App\Domain\Projects\Models\Project;

final class SaveDocument
{
    /**
     * Persist a new state of the drawing, but only if the caller's edit was based on the
     * revision that is still current.
     *
     * The check and the write are a single conditional UPDATE, so two saves racing each
     * other cannot both succeed: the loser matches zero rows and is told to reconcile.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws StaleRevisionException
     */
    public function handle(Document $document, array $data, int $basedOnRevision): Document
    {
        $next = $basedOnRevision + 1;

        $written = Document::query()
            ->whereKey($document->getKey())
            ->where('revision', $basedOnRevision)
            ->update([
                'data' => json_encode($data, JSON_THROW_ON_ERROR),
                'schema_version' => (int) ($data['schemaVersion'] ?? $document->schema_version),
                'revision' => $next,
                'updated_at' => now(),
            ]);

        if ($written === 0) {
            throw new StaleRevisionException(
                expected: $basedOnRevision,
                current: (int) Document::query()->whereKey($document->getKey())->value('revision'),
            );
        }

        // The dashboard orders by project activity, and a save is activity. Updated directly
        // rather than through the relation so autosave never loads the project it touches.
        Project::query()->whereKey($document->project_id)->update(['updated_at' => now()]);

        return $document->refresh();
    }
}
