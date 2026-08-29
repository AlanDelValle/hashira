<?php

declare(strict_types=1);

namespace App\Domain\Documents\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Raised when a save is based on a revision that is no longer current — another tab, device
 * or collaborator wrote first. We refuse the write rather than silently discarding their
 * work, and hand back the current revision so the client can decide what to do.
 */
final class StaleRevisionException extends RuntimeException
{
    public function __construct(
        public readonly int $expected,
        public readonly int $current,
    ) {
        parent::__construct(
            "This drawing was saved elsewhere (revision {$current}); your copy is based on revision {$expected}."
        );
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'expectedRevision' => $this->expected,
            'currentRevision' => $this->current,
        ], Response::HTTP_CONFLICT);
    }
}
