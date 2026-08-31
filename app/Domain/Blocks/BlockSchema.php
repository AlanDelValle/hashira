<?php

declare(strict_types=1);

namespace App\Domain\Blocks;

/**
 * The server's knowledge of what a block's drawing looks like.
 *
 * The same division of labour as `DocumentSchema`: the full contract is expressed once on the
 * client, and the server checks what has to be true for the thing to be storable and readable
 * at all. A block is stricter than a document, though, because it is drawn on *other people's*
 * sheets — a share link serves the blocks a drawing uses along with the drawing — so every
 * primitive is checked rather than only the envelope.
 */
final class BlockSchema
{
    /** The categories the library is grouped into, mirrored from assets/library.ts. */
    public const CATEGORIES = [
        'seating',
        'tables',
        'beds',
        'storage',
        'kitchen',
        'bathroom',
        'structure',
    ];

    /** Enough for a detailed piece of furniture; far short of a whole drawing. */
    public const MAX_PRIMITIVES = 400;

    /** Millimetres. A block smaller than this is a dot, and larger than this is a building. */
    public const MIN_SIZE = 1;

    public const MAX_SIZE = 100_000;

    /**
     * The first problem with a block's drawing, or null when there is none.
     *
     * @param  mixed  $draw
     */
    public static function drawProblem($draw): ?string
    {
        if (! is_array($draw) || ! array_is_list($draw) || $draw === []) {
            return 'A block has to be drawn with at least one line.';
        }

        if (count($draw) > self::MAX_PRIMITIVES) {
            return 'That is too much drawing for one block.';
        }

        foreach ($draw as $primitive) {
            if (($problem = self::primitiveProblem($primitive)) !== null) {
                return $problem;
            }
        }

        return null;
    }

    /** @param  mixed  $primitive */
    private static function primitiveProblem($primitive): ?string
    {
        if (! is_array($primitive) || ! isset($primitive['kind']) || ! is_string($primitive['kind'])) {
            return 'This block has a shape in it that Hashira cannot draw.';
        }

        $fields = match ($primitive['kind']) {
            'rect' => ['x', 'y', 'w', 'h'],
            'line' => ['x1', 'y1', 'x2', 'y2'],
            'ellipse' => ['cx', 'cy', 'rx', 'ry'],
            'arc' => ['cx', 'cy', 'r', 'from', 'to'],
            'polyline' => null,
            default => 'unknown',
        };

        if ($fields === 'unknown') {
            return 'This block has a shape in it that Hashira cannot draw.';
        }

        if ($fields === null) {
            return self::polylineProblem($primitive);
        }

        foreach ($fields as $field) {
            if (! isset($primitive[$field]) || ! is_numeric($primitive[$field])) {
                return 'This block has a shape in it with a missing measurement.';
            }
        }

        return null;
    }

    /** @param  array<string, mixed>  $primitive */
    private static function polylineProblem(array $primitive): ?string
    {
        $points = $primitive['points'] ?? null;

        if (! is_array($points) || ! array_is_list($points) || count($points) < 4 || count($points) % 2 !== 0) {
            return 'This block has a line in it with nowhere to go.';
        }

        foreach ($points as $value) {
            if (! is_numeric($value)) {
                return 'This block has a line in it with a missing measurement.';
            }
        }

        return isset($primitive['closed']) && ! is_bool($primitive['closed'])
            ? 'This block has a line in it that is neither open nor closed.'
            : null;
    }
}
