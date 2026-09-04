<?php

declare(strict_types=1);

namespace App\Domain\Blocks;

use App\Domain\Blocks\Models\Block;
use App\Domain\Projects\Models\Project;
use App\Domain\Sharing\ShareRole;
use Illuminate\Support\Collection;

/**
 * The blocks a drawing needs in order to be drawn.
 *
 * A plan stores an id and a size for every block on it, never the block's geometry — which is
 * what keeps drawings small and lets a corrected block improve every plan that uses it. The
 * price is that a reader has to be able to resolve the id, and a share link is read by someone
 * who has no library of their own. So the drawing travels with the definitions it refers to.
 *
 * A block belongs to a person, so "whose library" is a real question once a project has more
 * than one person in it. The answer is everybody who could have placed one: the owner, and
 * anybody with an editor's membership. Narrower than that and a drawing would look different
 * depending on who opened it — the owner seeing a dashed footprint where a collaborator had
 * placed a chair. An id belonging to nobody here is still left unresolved, and the editor
 * draws its footprint as a dashed rectangle, which is what it does for any block it does not
 * know.
 */
final class ReferencedBlocks
{
    /**
     * @param  array<string, mixed>  $drawing
     * @return Collection<int, Block>
     */
    public static function of(array $drawing, Project $project): Collection
    {
        $ids = self::assetIds($drawing);

        if ($ids === []) {
            /** @var Collection<int, Block> */
            return new Collection;
        }

        return Block::query()
            ->whereIn('user_id', self::libraries($project))
            ->whereIn('id', $ids)
            ->orderBy('name')
            ->get();
    }

    /** @return list<int> */
    private static function libraries(Project $project): array
    {
        /** @var list<int> $editors */
        $editors = $project->members()
            ->where('role', ShareRole::Editor->value)
            ->pluck('user_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        return array_values(array_unique([(int) $project->user_id, ...$editors]));
    }

    /**
     * @param  array<string, mixed>  $drawing
     * @return list<string>
     */
    private static function assetIds(array $drawing): array
    {
        $elements = $drawing['elements'] ?? null;

        if (! is_array($elements)) {
            return [];
        }

        $ids = [];

        foreach ($elements as $element) {
            if (! is_array($element) || ($element['type'] ?? null) !== 'asset') {
                continue;
            }

            $geometry = $element['geometry'] ?? null;
            $id = is_array($geometry) ? ($geometry['assetId'] ?? null) : null;

            if (is_string($id) && $id !== '') {
                $ids[$id] = true;
            }
        }

        return array_keys($ids);
    }
}
