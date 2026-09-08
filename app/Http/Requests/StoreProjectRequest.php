<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Organisations\Models\Organisation;
use Illuminate\Foundation\Http\FormRequest;

final class StoreProjectRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],

            /*
             * Which firm's it is, if it is a firm's. `exists` only says the row is there —
             * whether this person may put a project in it is a policy question, asked by the
             * controller, because authorization never comes from request input.
             */
            'organisationId' => ['nullable', 'string', 'exists:organisations,id'],
        ];
    }

    /** The organisation this project is being started in, if one was named. */
    public function organisation(): ?Organisation
    {
        $id = $this->validated('organisationId');

        return $id === null ? null : Organisation::query()->find($id);
    }
}
