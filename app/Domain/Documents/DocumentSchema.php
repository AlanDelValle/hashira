<?php

declare(strict_types=1);

namespace App\Domain\Documents;

use Illuminate\Support\Str;

/**
 * The server's knowledge of the document format.
 *
 * The full structural contract lives on the client, expressed once as TypeScript types and
 * the zod schema derived from them (docs/document-format.md). Duplicating all of it here
 * would guarantee the two drift apart, so the server is responsible for the envelope only:
 * the parts that decide whether a payload is storable and readable at all.
 *
 * That boundary is defensible because a document is only ever read back by its own author or
 * by someone holding a share link to it, and it is drawn onto a canvas rather than injected
 * into a page — so a malformed interior can only affect the drawing it belongs to.
 */
final class DocumentSchema
{
    /**
     * Bump this only alongside a migration and a fixture test.
     *
     * 2 added the `dimension` element; 3 turned it into a chain of points and added the
     * `angle`, `radius` and `leader` marks beside it. The server validates the envelope
     * rather than the interior, so the number is all that changes here — but it has to
     * change, or the server would refuse every document the current client writes.
     */
    public const CURRENT_VERSION = 3;

    /** A generous ceiling for a 2D plan; enough for thousands of elements. */
    public const MAX_BYTES = 8 * 1024 * 1024;

    public const LAYER_ARCHITECTURE = 'layer_architecture';

    public const LAYER_OPENINGS = 'layer_openings';

    public const LAYER_FURNITURE = 'layer_furniture';

    public const LAYER_DIMENSIONS = 'layer_dimensions';

    public const LAYER_ANNOTATIONS = 'layer_annotations';

    /**
     * A new, empty drawing. The server is the only place blank documents are created, so
     * that "what a new drawing looks like" has exactly one definition.
     *
     * @return array<string, mixed>
     */
    public static function blank(string $name): array
    {
        return [
            'schemaVersion' => self::CURRENT_VERSION,
            'id' => strtolower((string) Str::ulid()),
            'name' => $name,
            'settings' => [
                'unit' => 'm',
                'scale' => 50,
                'grid' => [
                    'size' => 100,          // millimetres between major grid lines
                    'subdivisions' => 2,
                    'visible' => true,
                    'snap' => true,
                ],
                'snapping' => [
                    'enabled' => true,
                    'endpoint' => true,
                    'midpoint' => true,
                    'intersection' => true,
                    'axis' => true,
                ],
                'sheet' => ['size' => 'A3', 'orientation' => 'landscape'],
                'title' => $name,
            ],
            'layers' => self::defaultLayers(),
            'elements' => [],
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function defaultLayers(): array
    {
        return [
            self::layer(self::LAYER_ARCHITECTURE, 'Architecture', '#1F2328', 0),
            self::layer(self::LAYER_OPENINGS, 'Openings', '#1F2328', 1),
            self::layer(self::LAYER_FURNITURE, 'Furniture', '#5F636B', 2),
            self::layer(self::LAYER_DIMENSIONS, 'Dimensions', '#2C58C4', 3),
            self::layer(self::LAYER_ANNOTATIONS, 'Annotations', '#5F636B', 4),
        ];
    }

    /**
     * Envelope checks. Returns the first problem found, or null when the payload is storable.
     *
     * @param  array<string, mixed>  $data
     */
    public static function envelopeProblem(array $data): ?string
    {
        $version = $data['schemaVersion'] ?? null;

        if (! is_int($version)) {
            return 'The document is missing a schema version.';
        }

        if ($version > self::CURRENT_VERSION) {
            return "This document was written by a newer version of Hashira (schema {$version}).";
        }

        foreach (['settings' => 'object', 'layers' => 'list', 'elements' => 'list'] as $key => $shape) {
            if (! array_key_exists($key, $data) || ! is_array($data[$key])) {
                return "The document is missing its {$key}.";
            }

            if ($shape === 'list' && ! array_is_list($data[$key])) {
                return "The document's {$key} must be a list.";
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private static function layer(string $id, string $name, string $color, int $order): array
    {
        return [
            'id' => $id,
            'name' => $name,
            'color' => $color,
            'visible' => true,
            'locked' => false,
            'order' => $order,
        ];
    }
}
