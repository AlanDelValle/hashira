<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A pin and the first thing said at it.
 *
 * The coordinates are drawing millimetres and are deliberately unbounded: a drawing has no
 * edges, and a remark can be made off to one side of the building it is about.
 */
final class StoreCommentThreadRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'elementId' => ['nullable', 'string', 'max:64'],
            'body' => ['required', 'string', 'max:4000'],
        ];
    }
}
