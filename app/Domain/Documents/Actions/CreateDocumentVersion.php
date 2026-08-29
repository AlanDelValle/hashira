<?php

declare(strict_types=1);

namespace App\Domain\Documents\Actions;

use App\Domain\Documents\Models\Document;
use App\Domain\Documents\Models\DocumentVersion;
use App\Models\User;

final class CreateDocumentVersion
{
    /**
     * Freeze the document as it stands right now. Snapshots are immutable and independent of
     * the document row, so restoring one later is a write, never a rollback.
     */
    public function handle(Document $document, User $author, ?string $label = null): DocumentVersion
    {
        return $document->versions()->create([
            'label' => $label,
            'schema_version' => $document->schema_version,
            'revision' => $document->revision,
            'data' => $document->data,
            'created_by' => $author->getKey(),
        ]);
    }
}
