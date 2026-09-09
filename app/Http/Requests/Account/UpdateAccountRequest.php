<?php

declare(strict_types=1);

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Your own name.
 *
 * Not your email: an address is what an invitation is written to and what a password reset is
 * sent to, so changing one is a flow with a message in it rather than a field on a form. It is
 * deliberately not here.
 */
final class UpdateAccountRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
        ];
    }
}
