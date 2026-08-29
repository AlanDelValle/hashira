<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Documents\Actions\SaveDocument;
use App\Domain\Documents\Models\Document;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\SaveDocumentRequest;
use App\Http\Resources\DocumentResource;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class DocumentController extends Controller
{
    public function show(Project $project): DocumentResource
    {
        Gate::authorize('view', $project);

        return DocumentResource::make($this->documentFor($project));
    }

    /**
     * The autosave endpoint. A stale revision raises StaleRevisionException, which renders
     * itself as 409 — see the action for why the check and the write are one statement.
     */
    public function update(SaveDocumentRequest $request, Project $project, SaveDocument $save): DocumentResource
    {
        Gate::authorize('update', $project);

        $document = $save->handle(
            document: $this->documentFor($project),
            data: $request->document(),
            basedOnRevision: $request->basedOnRevision(),
        );

        return DocumentResource::make($document);
    }

    private function documentFor(Project $project): Document
    {
        return $project->loadMissing('document')->document
            ?? throw new NotFoundHttpException('This project has no drawing.');
    }
}
