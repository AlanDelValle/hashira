<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Outside production, an N+1, a silently dropped attribute or a typo'd attribute name
        // should stop the request rather than reach a user as a subtly wrong drawing.
        Model::shouldBeStrict(! $this->app->isProduction());

        Password::defaults(fn () => $this->app->isProduction()
            ? Password::min(10)->uncompromised()
            : Password::min(8));

        // The reset form lives in the SPA. The token alone travels in the URL: asking for the
        // email address on the form instead keeps a personal identifier out of browser
        // history, referrers and server logs.
        ResetPassword::createUrlUsing(
            fn (object $notifiable, string $token): string => url("/reset-password/{$token}")
        );

        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceHttps();
        }

        // A ceiling for the whole API. Autosave is debounced and versions are manual, so a
        // signed-in editor stays far below this; a script does not.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(180)
            ->by($request->user()?->getAuthIdentifier() ?? $request->ip()));
    }
}
