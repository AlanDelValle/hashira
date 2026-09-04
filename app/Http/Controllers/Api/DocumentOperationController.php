<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Documents\Actions\AppendOperation;
use App\Domain\Documents\Events\OperationApplied;
use App\Domain\Documents\Models\Document;
use App\Domain\Projects\Models\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOperationRequest;
use App\Http\Resources\DocumentOperationResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The edits made to a drawing, in the order they were accepted.
 *
 * **Posting an operation is the write; the broadcast that follows is only delivery.** An edit
 * is in the log with its number before anybody else hears about it, so a socket that is down
 * costs people seeing each other work — never the work itself. That is what makes co-editing
 * degrade into ordinary editing rather than into losing things.
 *
 * `index` is how somebody who opened the drawing a minute late catches up: the snapshot they
 * loaded carries the sequence it was written at, and everything after it is here. Without that
 * there is a window where a reader is quietly behind, which is worse than being visibly behind.
 */
final class DocumentOperationController extends Controller
{
    /** How many an answer will carry. Beyond this, reloading the drawing is the cheaper move. */
    private const PAGE = 500;

    public function index(Request $request, Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);

        $after = max(0, (int) $request->query('after', '0'));

        return DocumentOperationResource::collection(
            $this->documentFor($project)
                ->operations()
                ->where('sequence', '>', $after)
                ->limit(self::PAGE)
                ->get(),
        );
    }

    public function store(
        StoreOperationRequest $request,
        Project $project,
        AppendOperation $append,
    ): JsonResponse {
        Gate::authorize('update', $project);

        /** @var User $user */
        $user = $request->user();

        $operation = $append->handle(
            document: $this->documentFor($project),
            author: $user,
            envelope: $request->envelope(),
            origin: (string) $request->validated('origin'),
        );

        OperationApplied::dispatch($project->id, $operation);

        return DocumentOperationResource::make($operation)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    private function documentFor(Project $project): Document
    {
        return $project->loadMissing('document')->document
            ?? throw new NotFoundHttpException('This project has no drawing.');
    }
}
