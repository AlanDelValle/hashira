<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The picture of a drawing that the projects list shows.
 *
 * Made by the editor, from the same scene every export is drawn from — which is rule 10 of
 * AGENTS.md applied to a screen rather than to the README: the picture of the product is
 * produced by the product, so it cannot advertise something the editor cannot draw. It costs
 * no new geometry and no second renderer.
 *
 * **An underlay is never in it**, and not because this remembers to leave it out: an underlay
 * is on the canvas and deliberately not in the scene, so the picture is of the drawing rather
 * than of somebody else's survey. The same reason a share link does not carry one.
 *
 * **It arrives as base64 in a JSON body rather than as a file upload.** The column stores
 * base64, so multipart would mean PHP writing a temporary file for something that is decoded
 * and re-encoded on the way past — and a temporary file is a thing that can fail: on the
 * machine this was written on, `php artisan serve` could not create one, and the editor's
 * pictures failed silently for exactly that reason until the request was looked at. A few
 * kilobytes of text needs none of that machinery. Underlays keep the upload, because those are
 * real files of somebody else's making and can be megabytes.
 *
 * Writing is gated on `update` and reading on `view`. A commenter opening the review surface
 * looks at a drawing and does not decide what it looks like in somebody else's list.
 */
final class ProjectPreviewController extends Controller
{
    /** Generous for a picture 320 pixels along its edge, and a hard stop on anything else. */
    private const MAX_BYTES = 100 * 1024;

    /** The eight bytes every PNG starts with. What is served as an image has to be one. */
    private const PNG_SIGNATURE = "\x89PNG\r\n\x1a\n";

    public function show(Project $project): Response
    {
        Gate::authorize('view', $project);

        $preview = $project->loadMissing('document')->document?->preview;
        $png = $preview === null ? false : base64_decode($preview, true);

        if ($png === false || $png === '') {
            throw new NotFoundHttpException;
        }

        /*
         * Revalidated rather than cached for a fixed time. A drawing's picture is rewritten
         * whenever somebody opens it, so no expiry is the right one — and an ETag turns almost
         * every one of these into a 304 carrying no image at all, which is what makes a list of
         * forty thumbnails cost about as much as a list of none.
         */
        return response($png, Response::HTTP_OK, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, no-cache',
            'ETag' => '"'.md5($preview).'"',
        ]);
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('update', $project);

        // 4/3 of the byte ceiling, plus room for the padding. The real limit is checked below,
        // on what the string decodes to; this only keeps an enormous body out of memory.
        $request->validate([
            'preview' => ['required', 'string', 'max:'.(int) ceil(self::MAX_BYTES * 4 / 3) + 8],
        ]);

        $document = $project->loadMissing('document')->document;

        // Nothing to describe. A project whose drawing has never been written has no picture,
        // and inventing a row here would be inventing a drawing.
        if ($document === null) {
            throw new NotFoundHttpException;
        }

        $encoded = (string) $request->string('preview');
        $png = base64_decode($encoded, true);

        if ($png === false || strlen($png) > self::MAX_BYTES || ! str_starts_with($png, self::PNG_SIGNATURE)) {
            throw ValidationException::withMessages([
                'preview' => 'That is not a picture this can show.',
            ]);
        }

        /*
         * Written without touching `updated_at`, which is what `timestamps = false` is for here.
         * The list orders by when the drawing was last worked on, and somebody merely opening a
         * plan to look at it would otherwise send it to the top — the opposite of what a picture
         * of it is for.
         */
        $document->timestamps = false;
        $document->preview = $encoded;
        $document->save();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
