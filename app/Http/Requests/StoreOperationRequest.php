<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * One edit, on its way into the log.
 *
 * The envelope is checked for being an object of a sane size and nothing more. What a command
 * means is `commands/envelope.ts`'s business — it parses one against the document's own
 * schemas at the far end, which is where a thing that came from elsewhere has to be read
 * rather than trusted. Validating it twice, in two languages, is how the two come to disagree.
 */
final class StoreOperationRequest extends FormRequest
{
    /** Generous, because a `replaceDocument` envelope carries two whole drawings. */
    private const MAX_BYTES = 4_000_000;

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'envelope' => ['required', 'array'],
            'envelope.type' => ['required', 'string', 'max:40'],
            // Which browser sent it, so that browser can skip its own echo.
            'origin' => ['required', 'string', 'max:40'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $envelope = $this->input('envelope');

            if (! is_array($envelope)) {
                return;
            }

            $encoded = json_encode($envelope);

            if ($encoded === false || strlen($encoded) > self::MAX_BYTES) {
                $validator->errors()->add('envelope', 'This edit is too large to record.');
            }
        });
    }

    /**
     * The envelope exactly as it arrived.
     *
     * Read from the input rather than from `validated()`, and that is not laziness: declaring
     * a rule for `envelope.type` makes `validated()` return *only* the keys that have rules,
     * which would store an envelope with its `type` and nothing else. The shape is checked
     * above; what goes into the log is what was sent, because the far end parses it against
     * the document's own schemas and needs all of it.
     *
     * @return array<string, mixed>
     */
    public function envelope(): array
    {
        /** @var array<string, mixed> $envelope */
        $envelope = $this->input('envelope');

        return $envelope;
    }
}
