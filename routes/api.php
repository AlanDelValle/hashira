<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthenticatedUserController;
use App\Http\Controllers\Api\BlockController;
use App\Http\Controllers\Api\CommentReplyController;
use App\Http\Controllers\Api\CommentThreadController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentOperationController;
use App\Http\Controllers\Api\DocumentVersionController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\MentionController;
use App\Http\Controllers\Api\OrganisationController;
use App\Http\Controllers\Api\OrganisationInvitationController;
use App\Http\Controllers\Api\OrganisationMemberController;
use App\Http\Controllers\Api\ProjectArchiveController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectDuplicationController;
use App\Http\Controllers\Api\ProjectMemberAdmissionController;
use App\Http\Controllers\Api\ProjectMemberController;
use App\Http\Controllers\Api\ProjectPeopleController;
use App\Http\Controllers\Api\ProjectPreviewController;
use App\Http\Controllers\Api\ProjectRestrictionController;
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

    /*
     * The remarks you were named in. Filtered by the authenticated user throughout, so there
     * is no policy to ask: a mention belonging to somebody else is not refused, it is not
     * found.
     */
    Route::get('mentions', [MentionController::class, 'index'])->name('mentions.index');
    Route::patch('mentions', [MentionController::class, 'update'])->name('mentions.readAll');
    Route::patch('mentions/{mention}', [MentionController::class, 'update'])
        ->name('mentions.read');

    /*
     * Firms. There is no `show`: an organisation is only ever met through the list, and a
     * route nobody calls is a route nobody maintains.
     */
    Route::apiResource('organisations', OrganisationController::class)
        ->only(['index', 'store', 'update', 'destroy']);

    /*
     * Who is in a firm. Listing is for anybody in it — knowing who else works on the drawings
     * you work on is not privileged — and changing anything is for its admins.
     */
    Route::get('organisations/{organisation}/members', [OrganisationMemberController::class, 'index'])
        ->name('organisations.members.index');
    Route::patch('organisations/{organisation}/members/{member}', [OrganisationMemberController::class, 'update'])
        ->name('organisations.members.update');
    Route::delete('organisations/{organisation}/members/{member}', [OrganisationMemberController::class, 'destroy'])
        ->name('organisations.members.destroy');

    Route::get('organisations/{organisation}/invitations', [OrganisationInvitationController::class, 'index'])
        ->name('organisations.invitations.index');
    Route::post('organisations/{organisation}/invitations', [OrganisationInvitationController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('organisations.invitations.store');
    /*
     * Bound by id and not by token, which is the model's own route key. An admin's list
     * deliberately never carries the token — a token in a list is a token in a screenshot and
     * a support conversation — so the one route they call has to address it another way.
     */
    Route::delete('organisations/{organisation}/invitations/{invitation:id}', [OrganisationInvitationController::class, 'destroy'])
        ->name('organisations.invitations.destroy');

    /*
     * The invitee's side. Authorized by the address the invitation was written to rather than
     * by any standing in the firm — somebody accepting is by definition not in it yet.
     */
    Route::get('invitations', [InvitationController::class, 'index'])->name('invitations.index');
    Route::get('invitations/{invitation}', [InvitationController::class, 'show'])
        ->middleware('throttle:30,1')
        ->name('invitations.show');
    Route::post('invitations/{invitation}/accept', [InvitationController::class, 'accept'])
        ->middleware('throttle:30,1')
        ->name('invitations.accept');
    Route::post('invitations/{invitation}/decline', [InvitationController::class, 'decline'])
        ->middleware('throttle:30,1')
        ->name('invitations.decline');

    Route::apiResource('projects', ProjectController::class);

    Route::get('blocks', [BlockController::class, 'index'])->name('blocks.index');
    Route::post('blocks', [BlockController::class, 'store'])->name('blocks.store');
    Route::delete('blocks/{block}', [BlockController::class, 'destroy'])->name('blocks.destroy');

    Route::post('projects/{project}/duplicate', ProjectDuplicationController::class)
        ->name('projects.duplicate');

    /*
     * Who in the firm may open this one. Restriction is its own route rather than a field on
     * the project, because deciding who may open a drawing and renaming it are different acts
     * asked of different people — and admitting a colleague is the exception a restricted
     * project is worked with.
     */
    Route::put('projects/{project}/restriction', [ProjectRestrictionController::class, 'update'])
        ->name('projects.restriction.update');
    Route::post('projects/{project}/members', [ProjectMemberAdmissionController::class, 'store'])
        ->name('projects.members.store');

    /*
     * The picture of the drawing, for the list. Served as an image rather than sent in the
     * list's payload so that the browser does what it is already good at: lazy loading what is
     * off screen, and revalidating the rest into 304s.
     */
    Route::get('projects/{project}/preview', [ProjectPreviewController::class, 'show'])
        ->name('projects.preview.show');
    Route::put('projects/{project}/preview', [ProjectPreviewController::class, 'update'])
        ->name('projects.preview.update');

    // Off the list, not out of the account. Its own route for the same reason restriction has
    // one: putting a drawing away is an owner's act and renaming it is an editor's.
    Route::put('projects/{project}/archive', [ProjectArchiveController::class, 'update'])
        ->name('projects.archive.update');

    Route::get('projects/{project}/document', [DocumentController::class, 'show'])
        ->name('projects.document.show');
    Route::put('projects/{project}/document', [DocumentController::class, 'update'])
        ->name('projects.document.update');

    /*
     * The edit log. Posting is the write and needs `update`; reading is how somebody who
     * opened the drawing late catches up, and needs only `view`.
     */
    Route::get('projects/{project}/operations', [DocumentOperationController::class, 'index'])
        ->name('projects.operations.index');
    Route::post('projects/{project}/operations', [DocumentOperationController::class, 'store'])
        ->name('projects.operations.store');

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
