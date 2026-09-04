<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Blocks\ReferencedBlocks;
use App\Domain\Documents\Models\Document;
use App\Domain\Sharing\ShareRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What an anonymous holder of a share link is allowed to see.
 *
 * Deliberately its own class rather than a variant of DocumentResource: keeping the public
 * shape separate means a field added for the owner's UI cannot leak to the public endpoint
 * by accident. There is no project, no owner, no identifiers and no revision here.
 *
 * The one thing it does say about the link is the role that link carries, because a link
 * offering more than viewing has to be able to say so: a visitor who is signed in can take it
 * up, and one who is not needs telling that signing in is what it would take. Saying it
 * reveals nothing — it is a property of the URL the reader is already holding.
 *
 * @mixin Document
 */
final class SharedDocumentResource extends JsonResource
{
    public function __construct(Document $document, private readonly ShareRole $role)
    {
        parent::__construct($document);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->name,
            'schemaVersion' => $this->schema_version,
            'drawing' => $this->data,
            // A visitor holding a link has no library of their own, so the blocks the drawing
            // uses travel with it — the definitions only, with nothing about who made them.
            'blocks' => BlockResource::collection(
                ReferencedBlocks::of($this->data, $this->project),
            ),
            'role' => $this->role->value,
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
