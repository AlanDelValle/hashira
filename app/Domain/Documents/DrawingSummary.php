<?php

declare(strict_types=1);

namespace App\Domain\Documents;

use App\Domain\Documents\Models\Document;
use Illuminate\Database\Eloquent\Builder;

/**
 * What a drawing is, worked out without reading the drawing.
 *
 * The projects list wants to say "A3 · 1:50 · 14 elements" about every card, in the same
 * vocabulary the status bar and the sheets panel already use. The only place that knows is
 * `documents.data`, which is the whole plan in one JSONB column — so eager loading it per card
 * would move megabytes into PHP in order to print four numbers. PostgreSQL is asked to count
 * instead: one correlated subquery per project, returning an object of about a hundred bytes.
 *
 * **Nothing here validates, and every figure is nullable.** A document whose shape a count
 * cannot be taken of reports null for that figure and the card leaves it out. That is the same
 * trade the document reader makes with a layer it cannot parse: a list that will not load
 * because one row is odd is worse than a card that is missing a number.
 */
final readonly class DrawingSummary
{
    public function __construct(
        /** The first sheet's page size — "A3". */
        public ?string $sheet,
        /** The denominator of that sheet's plotted scale: 50 means 1:50. */
        public ?float $scale,
        public ?int $elements,
        public ?int $layers,
        public ?int $sheets,
    ) {}

    /**
     * The subquery that computes one, for `addSelect(['drawing_summary' => …])`.
     *
     * Ordered oldest first, which picks the same row `Project::document()` does: one per
     * project today, and the first of them if a project ever grows to several.
     *
     * @return Builder<Document>
     */
    public static function subquery(): Builder
    {
        $sheet = "data->'settings'->'sheets'->0";

        $fields = implode(', ', [
            "'elements', ".self::length("data->'elements'"),
            "'layers', ".self::length("data->'layers'"),
            "'sheets', ".self::length("data->'settings'->'sheets'"),
            "'sheet', {$sheet}->>'size'",
            "'scale', {$sheet}->>'scale'",
        ]);

        return Document::query()
            ->selectRaw("jsonb_build_object({$fields})")
            ->whereColumn('project_id', 'projects.id')
            ->oldest()
            ->limit(1);
    }

    /** What comes back out of that column. Anything unreadable is nobody's summary. */
    public static function fromJson(mixed $raw): ?self
    {
        $decoded = is_string($raw) ? json_decode($raw, true) : null;

        if (! is_array($decoded)) {
            return null;
        }

        return new self(
            sheet: self::text($decoded['sheet'] ?? null),
            scale: self::number($decoded['scale'] ?? null),
            elements: self::count($decoded['elements'] ?? null),
            layers: self::count($decoded['layers'] ?? null),
            sheets: self::count($decoded['sheets'] ?? null),
        );
    }

    /** @return array{sheet: ?string, scale: ?float, elements: ?int, layers: ?int, sheets: ?int} */
    public function toArray(): array
    {
        return [
            'sheet' => $this->sheet,
            'scale' => $this->scale,
            'elements' => $this->elements,
            'layers' => $this->layers,
            'sheets' => $this->sheets,
        ];
    }

    /**
     * `jsonb_array_length`, guarded.
     *
     * The server validates the envelope rather than the interior (see DocumentSchema), so
     * `layers` and `elements` are known to be lists on anything saved through the API — but
     * `settings.sheets` is not checked by anybody here, and asking PostgreSQL for the length of
     * something that is not an array raises rather than returning null.
     */
    private static function length(string $path): string
    {
        return "case when jsonb_typeof({$path}) = 'array' then jsonb_array_length({$path}) end";
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function number(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    private static function count(mixed $value): ?int
    {
        return is_int($value) && $value >= 0 ? $value : null;
    }
}
