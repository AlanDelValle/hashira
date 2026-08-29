<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Sharing\Models\ShareLink;
use App\Http\Controllers\Controller;
use App\Http\Resources\SharedDocumentResource;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The only endpoint an anonymous visitor can reach.
 *
 * It answers 404 for unknown, revoked and expired tokens alike, so probing cannot tell the
 * three apart, and it returns SharedDocumentResource — a shape that has no project, owner or
 * identifier in it at all.
 */
final class SharedDocumentController extends Controller
{
    public function show(string $token): SharedDocumentResource
    {
        $link = ShareLink::query()->with('project.document')->where('token', $token)->first();

        if ($link === null || ! $link->isActive()) {
            throw new NotFoundHttpException;
        }

        $document = $link->project->document;

        if ($document === null) {
            throw new NotFoundHttpException;
        }

        $link->increment('view_count', 1, ['last_viewed_at' => now()]);

        return SharedDocumentResource::make($document);
    }
}
