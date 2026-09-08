<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Organisations\OrganisationRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreOrganisationInvitationRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            /*
             * Not `exists:users,email`. The whole point of inviting by address is that the
             * person may not have an account yet — requiring one first means telling a
             * colleague to go and register before they can be asked, which is where most
             * people stop.
             */
            'email' => ['required', 'string', 'email', 'max:255'],
            'role' => ['required', Rule::enum(OrganisationRole::class)],
        ];
    }
}
