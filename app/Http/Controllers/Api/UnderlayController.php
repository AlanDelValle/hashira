<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Projects\Models\Project;
use App\Domain\Underlays\Models\Underlay;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUnderlayRequest;
use App\Http\Resources\UnderlayResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Pages to trace over.
 *
 * They live on the private disk and are served by this controller rather than by a public
 * URL, because an underlay is usually somebody else's survey: sharing a drawing hands out the
 * drawing, and it should not quietly hand out the document it was traced from as well.
 */
final class UnderlayController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);

        return UnderlayResource::collection(
            $project->underlays()->orderBy('created_at')->get(),
        );
    }

    public function store(StoreUnderlayRequest $request, Project $project): JsonResponse
    {
        Gate::authorize('update', $project);

        $file = $request->file('image');

        if (! $file instanceof UploadedFile) {
            throw new NotFoundHttpException;
        }

        $path = $file->store("underlays/{$project->id}");

        if ($path === false) {
            throw new NotFoundHttpException;
        }

        $underlay = new Underlay;
        $underlay->project_id = $project->id;
        $underlay->name = $request->validated('name');
        $underlay->page = (int) $request->validated('page');
        $underlay->width = (int) $request->validated('width');
        $underlay->height = (int) $request->validated('height');
        $underlay->path = $path;
        $underlay->bytes = (int) $file->getSize();
        $underlay->save();

        return UnderlayResource::make($underlay)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function image(Project $project, Underlay $underlay): StreamedResponse
    {
        Gate::authorize('view', $project);

        if ($underlay->project_id !== $project->id || ! Storage::exists($underlay->path)) {
            throw new NotFoundHttpException;
        }

        return Storage::response($underlay->path, null, [
            'Content-Type' => 'image/png',
            // A rasterised page never changes: it is replaced rather than edited.
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    public function destroy(Project $project, Underlay $underlay): JsonResponse
    {
        Gate::authorize('update', $project);

        if ($underlay->project_id !== $project->id) {
            throw new NotFoundHttpException;
        }

        Storage::delete($underlay->path);
        $underlay->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
