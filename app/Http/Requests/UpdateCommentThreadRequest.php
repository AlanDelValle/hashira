<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Resolving, or putting a thread back. One field, because a conversation's only state is
 * whether it is still open.
 */
final class UpdateCommentThreadRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'resolved' => ['required', 'boolean'],
        ];
    }
}
