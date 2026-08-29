<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Documents\DocumentSchema;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

final class SaveDocumentRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'revision' => ['required', 'integer', 'min:0'],
            'data' => ['required', 'array'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            /** @var array<string, mixed>|null $data */
            $data = $this->input('data');

            if (! is_array($data)) {
                return;
            }

            $encoded = json_encode($data);

            if ($encoded === false || strlen($encoded) > DocumentSchema::MAX_BYTES) {
                $validator->errors()->add('data', 'This drawing is too large to save.');

                return;
            }

            if ($problem = DocumentSchema::envelopeProblem($data)) {
                $validator->errors()->add('data', $problem);
            }
        });
    }

    /** @return array<string, mixed> */
    public function document(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated('data');

        return $data;
    }

    public function basedOnRevision(): int
    {
        return (int) $this->validated('revision');
    }
}
