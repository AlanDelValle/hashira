<?php

declare(strict_types=1);

namespace App\Domain\Blocks\Models;

use App\Models\User;
use App\Policies\BlockPolicy;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A block somebody made, as opposed to one that ships with the editor.
 *
 * It is the same thing either way: a name, a default size, and a drawing in a normalised 0–1
 * box. That is why a drawing stores an id and a size for both, and why the editor can hand
 * either to the same painter — the library is where a block comes from, not what it is.
 *
 * @property string $id
 * @property int $user_id
 * @property string $name
 * @property string $category
 * @property int $width
 * @property int $height
 * @property list<array<string, mixed>> $draw
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[UsePolicy(BlockPolicy::class)]
class Block extends Model
{
    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'draw' => 'array',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
