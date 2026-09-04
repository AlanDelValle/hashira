<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthenticatedUserController;
use App\Http\Controllers\Api\BlockController;
use App\Http\Controllers\Api\CommentReplyController;
use App\Http\Controllers\Api\CommentThreadController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentVersionController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectDuplicationController;
use App\Http\Controllers\Api\ProjectMemberController;
use App\Http\Controllers\Api\ProjectPeopleController;
use App\Http\Controllers\Api\SharedDocumentController;
use App\Http\Controllers\Api\ShareLinkAcceptanceController;
use App\Http\Controllers\Api\ShareLinkController;
use App\Http\Controllers\Api\UnderlayController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\NewPasswordController;
use App\Http\Controllers\Auth\PasswordResetLinkController;
use App\Http\Controllers\Auth\RegisteredUserController;
use Illuminate\Support\Facades\Route;

/*
 * Mounted under /api on the `web` middleware group — see bootstrap/app.php. Authentication is
 * the browser session and writes are CSRF verified, so there is no token to store and nothing
 * sensitive parked in localStorage.
 */

/*
 * Somewhere for a tab to go and get its XSRF-TOKEN back.
 *
 * Every response from the `web` group carries that cookie, so this is normally never needed —
 * the page that served the SPA already set it. The case it exists for is a tab left open until
 * its session expired, which then has no token to send with its next write.
 *
 * It answers with nothing at all: the cookie is attached by the middleware, and the body would
 * only be something to ignore. Sanctum has an endpoint for exactly this, and this application
 * deliberately does not use Sanctum — see architecture.md §2.1 — so it has its own.
 */
Route::get('csrf-cookie', fn () => response()->noContent())->name('csrf-cookie');

Route::post('register', [RegisteredUserController::class, 'store'])
    ->middleware('throttle:6,1')
    ->name('register');

Route::post('login', [AuthenticatedSessionController::class, 'store'])
    ->middleware('throttle:12,1')
    ->name('login');

Route::post('forgot-password', [PasswordResetLinkController::class, 'store'])
    ->middleware('throttle:6,1')
    ->name('password.email');

Route::post('reset-password', [NewPasswordController::class, 'store'])
    ->middleware('throttle:6,1')
    ->name('password.store');

// Anonymous, rate limited, and deliberately outside every other group.
Route::get('share/{token}', [SharedDocumentController::class, 'show'])
    ->middleware('throttle:60,1')
    ->name('share.show');

Route::middleware('auth')->group(function (): void {
    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');
    Route::get('user', AuthenticatedUserController::class)->name('user');

    Route::apiResource('projects', ProjectController::class);

    Route::get('blocks', [BlockController::class, 'index'])->name('blocks.index');
    Route::post('blocks', [BlockController::class, 'store'])->name('blocks.store');
    Route::delete('blocks/{block}', [BlockController::class, 'destroy'])->name('blocks.destroy');

    Route::post('projects/{project}/duplicate', ProjectDuplicationController::class)
        ->name('projects.duplicate');

    Route::get('projects/{project}/document', [DocumentController::class, 'show'])
        ->name('projects.document.show');
    Route::put('projects/{project}/document', [DocumentController::class, 'update'])
        ->name('projects.document.update');

    Route::get('projects/{project}/underlays', [UnderlayController::class, 'index'])
        ->name('projects.underlays.index');
    Route::post('projects/{project}/underlays', [UnderlayController::class, 'store'])
        ->name('projects.underlays.store');
    Route::get('projects/{project}/underlays/{underlay}/image', [UnderlayController::class, 'image'])
        ->name('projects.underlays.image');
    Route::delete('projects/{project}/underlays/{underlay}', [UnderlayController::class, 'destroy'])
        ->name('projects.underlays.destroy');

    /*
     * Reading a drawing's conversations needs `view`; adding to them needs `comment`. Both are
     * checked in the controller, against the account rather than against anything sent.
     */
    Route::get('projects/{project}/comments', [CommentThreadController::class, 'index'])
        ->name('projects.comments.index');
    Route::post('projects/{project}/comments', [CommentThreadController::class, 'store'])
        ->name('projects.comments.store');
    Route::patch('projects/{project}/comments/{thread}', [CommentThreadController::class, 'update'])
        ->name('projects.comments.update');
    Route::delete('projects/{project}/comments/{thread}', [CommentThreadController::class, 'destroy'])
        ->name('projects.comments.destroy');

    Route::post('projects/{project}/comments/{thread}/replies', [CommentReplyController::class, 'store'])
        ->name('projects.comments.replies.store');
    Route::delete('projects/{project}/comments/{thread}/replies/{comment}', [CommentReplyController::class, 'destroy'])
        ->name('projects.comments.replies.destroy');

    Route::get('projects/{project}/versions', [DocumentVersionController::class, 'index'])
        ->name('projects.versions.index');
    Route::post('projects/{project}/versions', [DocumentVersionController::class, 'store'])
        ->name('projects.versions.store');
    Route::get('projects/{project}/versions/{version}', [DocumentVersionController::class, 'show'])
        ->name('projects.versions.show');

    /*
     * Taking up a link that offers commenting or editing. Behind `auth` while the endpoint
     * that serves the drawing is not, because this is the step that turns a token into a
     * person — and after it, the token is never consulted again.
     */
    Route::post('share/{token}/accept', ShareLinkAcceptanceController::class)
        ->middleware('throttle:30,1')
        ->name('share.accept');

    // Who can be mentioned: names and ids, for anybody who can open the project.
    Route::get('projects/{project}/people', ProjectPeopleController::class)
        ->name('projects.people');

    Route::get('projects/{project}/members', [ProjectMemberController::class, 'index'])
        ->name('projects.members.index');
    Route::delete('projects/{project}/members/{member}', [ProjectMemberController::class, 'destroy'])
        ->name('projects.members.destroy');

    Route::get('projects/{project}/share', [ShareLinkController::class, 'show'])
        ->name('projects.share.show');
    Route::post('projects/{project}/share', [ShareLinkController::class, 'store'])
        ->name('projects.share.store');
    Route::delete('projects/{project}/share', [ShareLinkController::class, 'destroy'])
        ->name('projects.share.destroy');
});
