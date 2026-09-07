<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | What the browser is told, at run time
    |--------------------------------------------------------------------------
    |
    | This block is printed into the page by `resources/views/app.blade.php` and read once by
    | `resources/js/lib/runtimeConfig.ts`. It exists because the alternative was `VITE_*`, and
    | Vite inlines those when the assets are built — which is fine on a machine that builds its
    | own, and useless for the thing Phase 10 is about. A published image is built once, by CI,
    | with nobody's socket configured; if the key lived in the bundle then every instance
    | pulling that image would have presence switched off for good, with no environment
    | variable able to reach it.
    |
    | So the rule is: anything the browser needs to know about *this* deployment is read here,
    | at run time, from configuration the operator sets — and `config:cache` keeps that cheap.
    |
    */

    'client' => [

        'reverb' => [

            /*
             * The empty string is the switch, exactly as it always was: with no key the client
             * never opens a connection, nobody sees anybody, and everything else is unchanged.
             *
             * It is also gated on the server actually broadcasting. A key set while the
             * broadcaster is `null` would have browsers connecting to a socket that will never
             * be sent anything — presence would work, live edits would not, and the difference
             * is the kind nobody debugs quickly.
             */
            'key' => env('BROADCAST_CONNECTION') === 'reverb'
                ? (string) env('REVERB_APP_KEY', '')
                : '',

            /*
             * Where the *browser* connects, which is not where PHP connects. In production the
             * two differ: PHP reaches Reverb over the container network on plain HTTP, while
             * the browser reaches it through the same TLS front door as everything else. The
             * `REVERB_HOST` fallbacks are for development, where they are the same machine.
             *
             * `?:` rather than a default argument, because a variable that is present and empty
             * — which is what `REVERB_CLIENT_HOST=` in a `.env` produces — is not absent as far
             * as `env()` is concerned, and would otherwise be taken as the answer.
             */
            'host' => (string) (env('REVERB_CLIENT_HOST') ?: env('REVERB_HOST', 'localhost')),
            'port' => (int) (env('REVERB_CLIENT_PORT') ?: env('REVERB_PORT', 8080)),
            'scheme' => (string) (env('REVERB_CLIENT_SCHEME') ?: env('REVERB_SCHEME', 'http')),
        ],

    ],

];
