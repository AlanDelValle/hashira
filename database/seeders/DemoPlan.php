<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Documents\DocumentSchema;
use Illuminate\Support\Str;

/**
 * A small but real drawing, so that a fresh install has something to open rather than an
 * empty sheet — and so that the landing page has something honest to show, since the drawing
 * there is this plan put through the editor's own SVG exporter.
 *
 * A 4.00 × 4.00 m bedroom: a wardrobe down one wall, a bed against another, a window, a door
 * that swings into the room, and the four dimensions a set-out drawing would carry.
 *
 * Everything is in millimetres, per docs/document-format.md. Wall centrelines run corner to
 * corner; the poché is drawn from the thickness.
 */
final class DemoPlan
{
    private const THICKNESS = 150;

    private const WIDTH = 4000;

    private const DEPTH = 4000;

    /** Where the inside face of a wall sits, which is what furniture stands against. */
    private const FACE = self::THICKNESS / 2;

    /** @return array<string, mixed> */
    public static function document(string $name): array
    {
        $document = DocumentSchema::blank($name);

        // Walls run clockwise from the north-west corner, so that "along the wall" means the
        // same thing for every opening measured on one.
        $north = self::wall(0, 0, self::WIDTH, 0);
        $east = self::wall(self::WIDTH, 0, self::WIDTH, self::DEPTH);
        $south = self::wall(0, self::DEPTH, self::WIDTH, self::DEPTH);
        $west = self::wall(0, self::DEPTH, 0, 0);

        // Both openings, as distances along the wall they cut, from that wall's first corner.
        $windowOffset = 2000;
        $windowWidth = 1200;
        $doorOffset = 600;
        $doorWidth = 900;

        $document['elements'] = [
            $north,
            $east,
            $south,
            $west,

            self::opening('window', $east['id'], offset: $windowOffset, width: $windowWidth),
            self::opening('door', $west['id'], offset: $doorOffset, width: $doorWidth),

            /*
             * The set-out: overall width above the plan and overall depth beside it, then the
             * two openings dimensioned against the walls they are cut into. The offsets are
             * signed, which is how each line is put on the outside of its wall rather than in
             * the middle of the room — and they come in two ranks so the lines never cross.
             *
             * The window's rank is set out at 400 rather than 250 like the door's. A value is
             * written above its own dimension line, in the line's reading frame, which is the
             * drafting convention and means "above" lands on opposite sides of a drawing for
             * the two vertical dimensions: away from the building on the left, back towards it
             * on the right. At 250 the window's value sat on the window it was measuring.
             */
            self::dimension(0, 0, self::WIDTH, 0, offset: -250),
            self::dimension(self::WIDTH, self::DEPTH, self::WIDTH, 0, offset: 700),
            self::dimension(
                self::WIDTH,
                $windowOffset + $windowWidth / 2,
                self::WIDTH,
                $windowOffset - $windowWidth / 2,
                offset: 400,
            ),
            self::dimension(
                0,
                self::DEPTH - $doorOffset + $doorWidth / 2,
                0,
                self::DEPTH - $doorOffset - $doorWidth / 2,
                offset: -250,
            ),

            self::roomLabel('Bedroom', 2100, 2350),

            // Blocks from the library, each standing against the face of the wall behind it
            // rather than floating near it.
            self::block('bed-double', 1400, 2000, 2300, self::FACE + 1000),
            self::block('wardrobe', 2500, 600, self::FACE + 300, self::FACE + 1250, rotation: M_PI / 2),
            self::block('bookshelf', 900, 300, 2300, self::DEPTH - self::FACE - 150),
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

        /*
         * A door says how it operates and how it is closed at the top, since schema 8. Neither
         * is optional: the seed stamps the current version, so nothing migrates it on the way
         * in, and a door missing either field is dropped on load as a broken element — which
         * is exactly what the dimensions here spent four schema versions doing.
         */
        if ($type === 'door') {
            $geometry['swing'] = 'left';
            $geometry['flipped'] = false;
            $geometry['leaf'] = 'single';
            $geometry['head'] = 'square';
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
        int|float $x,
        int|float $y,
        float $rotation = 0.0,
    ): array {
        return self::element(
            'asset',
            DocumentSchema::LAYER_FURNITURE,
            ['assetId' => $assetId, 'width' => $width, 'height' => $height, 'mirrored' => false],
            ['x' => $x, 'y' => $y, 'rotation' => $rotation],
        );
    }

    /**
     * A measurement between two points. The value is not stored: the editor reads it off the
     * geometry every time it draws it, so the number on the sheet cannot drift away from the
     * thing it measures.
     *
     * The two points go in a `points` run, which is the shape a dimension has had since schema
     * 3. This wrote `a` and `b` for four schema versions after that, and because the seed
     * stamps the current version nothing migrated it on the way in: every dimension in a
     * freshly seeded plan was dropped on load as unreadable, and a fresh install opened its
     * sample drawing missing a third of itself. It went unseen because the development
     * database was seeded before the change and never seeded again.
     *
     * @return array<string, mixed>
     */
    private static function dimension(
        int|float $ax,
        int|float $ay,
        int|float $bx,
        int|float $by,
        int $offset,
    ): array {
        $centreX = ($ax + $bx) / 2;
        $centreY = ($ay + $by) / 2;

        return self::element(
            'dimension',
            DocumentSchema::LAYER_DIMENSIONS,
            [
                'points' => [
                    ['x' => $ax - $centreX, 'y' => $ay - $centreY],
                    ['x' => $bx - $centreX, 'y' => $by - $centreY],
                ],
                'offset' => $offset,
                'fontSize' => 200,
            ],
            ['x' => $centreX, 'y' => $centreY, 'rotation' => 0],
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
