<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        /*
         * The API is served by the same application, on the same origin, to the same browser
         * session as the pages. So it runs on the `web` middleware group — real session
         * authentication and real CSRF verification — rather than the stateless `api` group
         * with a token bridge bolted on to make it behave like a session anyway.
         *
         * Routes are registered explicitly, and in this order, so that the SPA catch-all in
         * web.php can never shadow an API route.
         */
        using: function (): void {
            Route::middleware(['web', 'throttle:api'])
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')->group(base_path('routes/web.php'));
        },
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * A drawing is data, not form input.
         *
         * Laravel trims every string in a request and turns the empty ones into null, which
         * is right for an HTML form — a field nobody typed in arrives as "" and means nothing
         * was entered. It is wrong for a document. These run over the whole body, so on the
         * autosave endpoint they ran over the drawing: an unfilled title-block field, a
         * drawing with no notes and a label somebody had cleared all reached the database as
         * null, and nothing in the format allows one there.
         *
         * What that cost was not the nulls themselves. The settings reader parsed the whole
         * object at once, so one null anywhere in it failed the parse and handed the editor
         * the defaults — unit, scale, grid, snapping, title, title block and notes, all reset,
         * silently, on every load — and autosave then wrote the defaults back over what the
         * drawing actually said. A text element whose content had been cleared was dropped on
         * load for the same reason, and saved away with the rest. The reader is no longer
         * all-or-nothing about settings (model/document.ts), but the middleware had no
         * business in the payload either way.
         *
         * Matched on the path rather than the route name because both middlewares are global:
         * they run before the router has bound anything, so there is no route to ask. The
         * feature test saves through the real endpoint, so the day this path changes and this
         * predicate does not, it fails.
         */
        $savingADrawing = fn (Request $request): bool => $request->isMethod('PUT')
            && $request->is('api/projects/*/document');

        $middleware->trimStrings(except: [$savingADrawing]);
        $middleware->convertEmptyStringsToNull(except: [$savingADrawing]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
