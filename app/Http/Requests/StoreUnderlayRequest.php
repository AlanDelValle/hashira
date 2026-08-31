<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The page arrives already rasterised.
 *
 * Turning a PDF into a picture needs a renderer, and the browser has one — the same library
 * the exporter uses in the other direction. Doing it on the server would mean Ghostscript or
 * Imagick on every machine that runs this, which is a dependency the project has gone out of
 * its way not to have.
 */
final class StoreUnderlayRequest extends FormRequest
{
    /** A page picture, generously sized: an A1 at a tracing resolution is a few megabytes. */
    public const MAX_KILOBYTES = 12 * 1024;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:160'],
            'page' => ['required', 'integer', 'min:1', 'max:9999'],
            'width' => ['required', 'integer', 'min:1', 'max:100000'],
            'height' => ['required', 'integer', 'min:1', 'max:100000'],
            'image' => ['required', 'file', 'mimes:png', 'max:'.self::MAX_KILOBYTES],
        ];
    }
}
