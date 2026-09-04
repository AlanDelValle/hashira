<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Sharing\ShareRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreShareLinkRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'expiresAt' => ['nullable', 'date', 'after:now'],
            'role' => ['nullable', Rule::enum(ShareRole::class)],
        ];
    }

    /** Absent means viewer: the safest of the three, and what every existing caller meant. */
    public function role(): ShareRole
    {
        $role = $this->validated('role');

        return is_string($role) ? ShareRole::from($role) : ShareRole::Viewer;
    }
}
