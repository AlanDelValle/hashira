<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Default broadcaster
    |--------------------------------------------------------------------------
    |
    | `null` is the default on purpose, and it is what a fresh clone and CI get: presence and
    | live co-editing are optional, and an instance that never runs Reverb should never pay
    | for it. Set it to `reverb` only alongside a socket server that is actually up.
    |
    */

    'default' => env('BROADCAST_CONNECTION', 'null'),

    'connections' => [

        'reverb' => [
            'driver' => 'reverb',
            'key' => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),

            'options' => [
                'host' => env('REVERB_HOST'),
                'port' => env('REVERB_PORT', 443),
                'scheme' => env('REVERB_SCHEME', 'https'),
                'useTLS' => env('REVERB_SCHEME', 'https') === 'https',
            ],

            /*
             * This file exists for these two numbers.
             *
             * The events that go out are `ShouldBroadcastNow`, so the HTTP call to Reverb
             * happens inside the request that saved the edit. Guzzle's default is to wait
             * indefinitely, which means a socket container that has stopped does not just cost
             * somebody the news — it holds the drawing's every save open until the web server
             * gives up on it. Bounded, the same failure costs a second and is written to the
             * log by `App\Support\Delivery`, which is where the exception is caught.
             *
             * Reverb is normally a container away on the same network, so a second to make the
             * connection is generous rather than tight.
             */
            'client_options' => [
                'connect_timeout' => (float) env('REVERB_CONNECT_TIMEOUT', 1),
                'timeout' => (float) env('REVERB_TIMEOUT', 3),
            ],
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
