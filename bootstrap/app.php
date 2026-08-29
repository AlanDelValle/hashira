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
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
