<?php

declare(strict_types=1);

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Changing a password you know, which is not the same act as resetting one you have forgotten.
 *
 * The reset flow proves who you are with a token sent to your inbox. This proves it with the
 * password itself, because somebody who walked past an unlocked screen has the session and not
 * the secret — and taking the account from its owner should cost more than a moment alone with
 * their laptop.
 */
final class UpdatePasswordRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'currentPassword' => ['required', 'string', 'current_password'],
            'password' => ['required', 'string', 'confirmed', Password::defaults()],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'currentPassword.current_password' => 'That is not your current password.',
        ];
    }
}
