<?php

declare(strict_types=1);

namespace App\Domain\Documents\Actions;

use App\Domain\Documents\Models\Document;
use App\Domain\Documents\Models\DocumentOperation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Accepting one edit, and giving it its place in the order.
 *
 * **The number is taken by incrementing a column, not by counting the log.** Two edits
 * arriving in the same instant must not be handed the same sequence, and `max(sequence) + 1`
 * is a read-then-write with a race in the middle. One statement, and the database serialises
 * it for us.
 *
 * The envelope goes in as it arrived. This end orders and stores; what a command *means* is
 * settled by `commands/envelope.ts` when it parses one against the document's own schemas,
 * and a second implementation of that here is exactly what building the envelope once was
 * meant to avoid.
 */
final class AppendOperation
{
    /**
     * @param  array<string, mixed>  $envelope
     */
    public function handle(
        Document $document,
        User $author,
        array $envelope,
        string $origin,
    ): DocumentOperation {
        return DB::transaction(function () use ($document, $author, $envelope, $origin): DocumentOperation {
            /** @var object{operation_sequence: int|string}|null $row */
            $row = DB::selectOne(
                'update documents set operation_sequence = operation_sequence + 1
                 where id = ? returning operation_sequence',
                [$document->getKey()],
            );

            $operation = new DocumentOperation;
            $operation->document_id = $document->getKey();
            $operation->sequence = (int) ($row->operation_sequence ?? 0);
            $operation->user_id = (int) $author->getKey();
            $operation->origin = Str::limit($origin, 40, '');
            $operation->envelope = $envelope;
            $operation->created_at = now();
            $operation->save();

            return $operation;
        });
    }
}
