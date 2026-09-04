<?php

declare(strict_types=1);

namespace App\Domain\Comments;

use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Who a remark was aimed at.
 *
 * A mention is written as `@` and a person's name, and it is resolved **here and only here**.
 * The client does not parse: it is handed back the exact text of each mention along with who
 * it meant, and highlights those strings. Two implementations of one matching rule is how the
 * picture and the record end up disagreeing about who was addressed.
 *
 * Only people on the project can be mentioned. Anybody else is left as plain text, because
 * `@` in front of a word is not a mention — it is the way people write about doors at
 * `@900mm`, and a stranger's name typed into a drawing they cannot open is a mention of
 * nobody.
 *
 * **The text as written is stored alongside the id.** Names change; what somebody typed does
 * not, and a comment is a record of what was said. Highlighting by re-deriving today's name
 * would quietly rewrite last month's conversation.
 */
final class Mentions
{
    /**
     * The longest roster name that follows each `@`, and who it means.
     *
     * Longest first, so "Ana Paula" is not read as "Ana" when both are on the project.
     *
     * @param  Collection<int, User>  $people
     * @return list<array{user: User, text: string}>
     */
    public static function in(string $body, Collection $people): array
    {
        /** @var list<User> $byLength */
        $byLength = $people
            ->sortByDesc(fn (User $person): int => mb_strlen($person->name))
            ->values()
            ->all();

        $found = [];
        $offset = 0;

        while (($at = mb_strpos($body, '@', $offset)) !== false) {
            $offset = $at + 1;

            foreach ($byLength as $person) {
                $name = $person->name;

                if (mb_substr($body, $at + 1, mb_strlen($name)) !== $name) {
                    continue;
                }

                // One row per person however often they are named: being addressed twice in
                // one remark is being addressed once.
                $found[(int) $person->getKey()] = [
                    'user' => $person,
                    'text' => '@'.$name,
                ];

                $offset = $at + 1 + mb_strlen($name);
                break;
            }
        }

        return array_values($found);
    }
}
