<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Documents\Actions\CreateDocumentVersion;
use App\Domain\Documents\Models\Document;
use App\Domain\Documents\Models\DocumentVersion;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDocumentVersionRequest;
use App\Http\Resources\DocumentVersionResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class DocumentVersionController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);

        $versions = $this->documentFor($project)
            ->versions()
            ->with('author')
            ->get();

        return DocumentVersionResource::collection($versions);
    }

    public function store(
        StoreDocumentVersionRequest $request,
        Project $project,
        CreateDocumentVersion $createVersion,
    ): JsonResponse {
        Gate::authorize('update', $project);

        /** @var User $user */
        $user = $request->user();

        $version = $createVersion->handle(
            document: $this->documentFor($project),
            author: $user,
            label: $request->validated('label'),
        );

        return DocumentVersionResource::make($version)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Project $project, DocumentVersion $version): DocumentVersionResource
    {
        Gate::authorize('view', $project);

        // A version id is guessable only by its owner, but the ownership chain is checked
        // rather than assumed: the version must belong to this project's document.
        if ($version->document_id !== $this->documentFor($project)->getKey()) {
            throw new NotFoundHttpException;
        }

        return new DocumentVersionResource($version->load('author'), withData: true);
    }

    private function documentFor(Project $project): Document
    {
        return $project->loadMissing('document')->document
            ?? throw new NotFoundHttpException('This project has no drawing.');
    }
}
