<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Documents\DocumentSchema;
use Illuminate\Support\Str;

/**
 * A small but real drawing, so that a fresh install has something to open rather than an
 * empty sheet: a 6.00 × 4.00 m room with a door and a window.
 *
 * Everything is in millimetres, per docs/document-format.md. Wall centrelines run corner to
 * corner; the poché is drawn from the thickness.
 */
final class DemoPlan
{
    private const THICKNESS = 150;

    private const WIDTH = 6000;

    private const DEPTH = 4000;

    /** @return array<string, mixed> */
    public static function document(string $name): array
    {
        $document = DocumentSchema::blank($name);

        $south = self::wall(0, self::DEPTH, self::WIDTH, self::DEPTH);
        $north = self::wall(0, 0, self::WIDTH, 0);

        $document['elements'] = [
            $north,
            self::wall(self::WIDTH, 0, self::WIDTH, self::DEPTH),
            $south,
            self::wall(0, self::DEPTH, 0, 0),

            // A 900 mm door 1.20 m along the south wall, and a 1.60 m window centred north.
            self::opening('door', $south['id'], offset: 1200, width: 900),
            self::opening('window', $north['id'], offset: self::WIDTH / 2, width: 1600),

            // Placed in the one part of the floor the furniture leaves clear, the way a label
            // is set out on a real plan rather than dropped in the middle of the sofa.
            self::roomLabel('Living', 2700, 3200),

            // A few blocks from the library, so a fresh install opens on a furnished plan
            // rather than an empty shell.
            self::block('bed-double', 1400, 2000, 1000, 1200),
            self::block('sofa-2', 1600, 900, 3900, 1000),
            self::block('table-round', 1200, 1200, 4400, 2900),
            self::block('wardrobe', 1200, 600, 1000, 3400),
        ];

        return $document;
    }

    /** @return array<string, mixed> */
    private static function wall(int $ax, int $ay, int $bx, int $by): array
    {
        return self::element('wall', DocumentSchema::LAYER_ARCHITECTURE, [
            'a' => ['x' => $ax, 'y' => $ay],
            'b' => ['x' => $bx, 'y' => $by],
            'thickness' => self::THICKNESS,
        ]);
    }

    /** @return array<string, mixed> */
    private static function opening(string $type, string $hostId, int $offset, int $width): array
    {
        $geometry = [
            'hostId' => $hostId,
            'offset' => $offset,
            'width' => $width,
        ];

        if ($type === 'door') {
            $geometry['swing'] = 'left';
            $geometry['flipped'] = false;
        }

        return self::element($type, DocumentSchema::LAYER_OPENINGS, $geometry);
    }

    /**
     * A library block. The document records which block and how big it is; the drawing of it
     * lives in the editor's library, so a plan never carries a few hundred coordinates for a
     * sofa.
     *
     * @return array<string, mixed>
     */
    private static function block(
        string $assetId,
        int $width,
        int $height,
        int $x,
        int $y,
    ): array {
        return self::element(
            'asset',
            DocumentSchema::LAYER_FURNITURE,
            ['assetId' => $assetId, 'width' => $width, 'height' => $height, 'mirrored' => false],
            ['x' => $x, 'y' => $y, 'rotation' => 0],
        );
    }

    /** @return array<string, mixed> */
    private static function roomLabel(string $content, int $x, int $y): array
    {
        return self::element(
            'text',
            DocumentSchema::LAYER_ANNOTATIONS,
            ['content' => $content, 'fontSize' => 250, 'align' => 'center'],
            ['x' => $x, 'y' => $y, 'rotation' => 0],
        );
    }

    /**
     * @param  array<string, mixed>  $geometry
     * @param  array<string, int|float>|null  $transform
     * @return array<string, mixed>
     */
    private static function element(
        string $type,
        string $layerId,
        array $geometry,
        ?array $transform = null,
    ): array {
        return [
            'id' => strtolower((string) Str::ulid()),
            'type' => $type,
            'layerId' => $layerId,
            'transform' => $transform ?? ['x' => 0, 'y' => 0, 'rotation' => 0],
            'geometry' => $geometry,
            'metadata' => ['createdAt' => now()->toIso8601String()],
        ];
    }
}
