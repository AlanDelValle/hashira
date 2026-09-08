<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Organisations\OrganisationRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateOrganisationMemberRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(OrganisationRole::class)],
        ];
    }
}
