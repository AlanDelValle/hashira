<?php

declare(strict_types=1);

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The password, again, for the one act that cannot be undone.
 *
 * A session is a thing somebody can walk up to; the password is a thing they have to know. It
 * is the same reason changing a password asks for the old one, applied to the larger act.
 */
final class DeleteAccountRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string', 'current_password'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'password.current_password' => 'That is not your password.',
        ];
    }
}
