<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Sharing\ShareRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class AdmitProjectMemberRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'userId' => ['required', 'integer', 'exists:users,id'],

            /*
             * Not `viewer`. Viewing is anonymous by decision and is never recorded, so a viewer
             * row would be a row that means nothing — see the Phase 9 decisions. Somebody who
             * should only look at a restricted drawing gets a link.
             */
            'role' => ['required', Rule::in([ShareRole::Commenter->value, ShareRole::Editor->value])],
        ];
    }
}
