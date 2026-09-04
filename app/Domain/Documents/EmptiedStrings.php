<?php

declare(strict_types=1);

namespace App\Domain\Documents;

/**
 * A drawing, with the nulls a middleware left in it turned back into the empty strings it was
 * saved with.
 *
 * Until 2026-09-04 the autosave endpoint ran under Laravel's global ConvertEmptyStringsToNull,
 * which walks the whole request body and so walked the document: every empty string in a saved
 * drawing reached the database as null, and the format allows one nowhere it put them. That is
 * fixed at the source in bootstrap/app.php, and the reader no longer throws away a whole
 * settings object over one of them — but a document written while it was happening is still
 * sitting in the database saying null, which is what the migration beside this class is for.
 *
 * It is a class rather than a body of code inside that migration because it has to be tested
 * against a fixture, and a migration carrying logic nobody can run is a migration nobody can
 * check. Two rules keep it honest:
 *
 * 1. **Only fields the format says are strings.** A drawing is full of legitimate nulls —
 *    `sheet.centre`, `style.fill`, `style.hatch`, `style.lineType`, `metadata.label` — and a
 *    repair that could not tell those apart would be the same damage over again.
 * 2. **Only fields somebody can empty.** A sheet's name and an element's stroke are strings
 *    too, and nothing in the interface can clear either, so nothing here touches them.
 */
final class EmptiedStrings
{
    /**
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    public static function restoredIn(array $document): array
    {
        if (is_array($document['settings'] ?? null)) {
            /** @var array<string, mixed> $settings */
            $settings = $document['settings'];
            $document['settings'] = self::restoredSettings($settings);
        }

        if (is_array($document['elements'] ?? null)) {
            /** @var array<mixed> $elements */
            $elements = $document['elements'];
            $document['elements'] = array_map(self::restoredElement(...), $elements);
        }

        return $document;
    }

    /**
     * The title, the notes and every field of the title block — the settings a person types
     * into and is entitled to leave blank.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private static function restoredSettings(array $settings): array
    {
        foreach (['title', 'notes'] as $key) {
            $settings = self::restored($settings, $key);
        }

        if (is_array($settings['titleBlock'] ?? null)) {
            /** @var array<string, mixed> $block */
            $block = $settings['titleBlock'];

            foreach (array_keys(DocumentSchema::emptyTitleBlock()) as $key) {
                $block = self::restored($block, $key);
            }

            $settings['titleBlock'] = $block;
        }

        return $settings;
    }

    /**
     * A label whose words were rubbed out.
     *
     * This is the one the reader cannot cope with on its own. `content` is not nullable, so a
     * text element holding a null is an element the parser drops — and a dropped element is
     * autosaved away, which is the whole plan losing a label rather than a field losing its
     * value. The words are gone either way; what the repair saves is the label itself, still
     * where somebody put it and ready to be typed into again.
     */
    private static function restoredElement(mixed $element): mixed
    {
        if (! is_array($element) || ($element['type'] ?? null) !== 'text') {
            return $element;
        }

        if (! is_array($element['geometry'] ?? null)) {
            return $element;
        }

        /** @var array<string, mixed> $geometry */
        $geometry = $element['geometry'];
        $element['geometry'] = self::restored($geometry, 'content');

        return $element;
    }

    /**
     * One value, as the empty string it used to be.
     *
     * A key that was never there stays never there: filling in a blank the drawing does not
     * carry is the reader's job, and it has defaults for exactly that.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private static function restored(array $values, string $key): array
    {
        if (array_key_exists($key, $values) && $values[$key] === null) {
            $values[$key] = '';
        }

        return $values;
    }
}
