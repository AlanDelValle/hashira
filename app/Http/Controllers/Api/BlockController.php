<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Blocks\Models\Block;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBlockRequest;
use App\Http\Resources\BlockResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Blocks somebody made.
 *
 * There is no update: a block is a drawing, and correcting one means drawing it again. That
 * keeps every plan that already uses a block safe from an edit made months later on another
 * project — the one thing a shared library must never do quietly.
 */
final class BlockController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        $blocks = Block::query()
            ->where('user_id', $user->getKey())
            ->orderBy('name')
            ->get();

        return BlockResource::collection($blocks);
    }

    public function store(StoreBlockRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $block = new Block;
        $block->user_id = (int) $user->getKey();
        $block->name = $request->validated('name');
        $block->category = $request->validated('category');
        $block->width = (int) $request->validated('width');
        $block->height = (int) $request->validated('height');
        $block->draw = $request->validated('draw');
        $block->save();

        return BlockResource::make($block)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function destroy(Block $block): JsonResponse
    {
        Gate::authorize('delete', $block);

        $block->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
