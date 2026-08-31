<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Blocks\BlockSchema;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class StoreBlockRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'category' => ['required', 'string', Rule::in(BlockSchema::CATEGORIES)],
            'width' => ['required', 'integer', 'min:'.BlockSchema::MIN_SIZE, 'max:'.BlockSchema::MAX_SIZE],
            'height' => ['required', 'integer', 'min:'.BlockSchema::MIN_SIZE, 'max:'.BlockSchema::MAX_SIZE],
            'draw' => ['required', 'array'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $problem = BlockSchema::drawProblem($this->input('draw'));

            if ($problem !== null) {
                $validator->errors()->add('draw', $problem);
            }
        });
    }
}
