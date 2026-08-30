<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>{{ config('app.name', 'Hashira') }} — Design spaces. Precisely.</title>
        <meta
            name="description"
            content="A free and open-source 2D design tool for floor plans, interiors and technical drawings."
        />

        {{-- The mark, at the sizes each platform actually asks for. `resources/js/ui/Logo.tsx`
        draws the same shape for the interface itself. --}}
        <link rel="icon" href="{{ asset('favicon.ico') }}" sizes="32x32" />
        <link rel="icon" type="image/png" sizes="32x32" href="{{ asset('favicon-32x32.png') }}" />
        <link rel="icon" type="image/png" sizes="16x16" href="{{ asset('favicon-16x16.png') }}" />
        <link rel="apple-touch-icon" href="{{ asset('apple-touch-icon.png') }}" />
        <link rel="manifest" href="{{ asset('site.webmanifest') }}" />

        {{-- The paper the application is drawn on, so a phone's browser chrome matches it rather
        than framing it in white. --}}
        <meta name="theme-color" content="#f4f3f0" />

        {{-- React Refresh's preamble, and it must come before the app script. Without it
        @vitejs/plugin-react throws while evaluating the first module and nothing mounts — a blank
        page in dev only, since the production build has no refresh runtime at all. The directive
        emits nothing when not running `vite dev`. --}} @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    </head>
    <body>
        {{-- React Router decides what renders here; every non-API path serves this same shell. --}}
        <div id="app"></div>

        <noscript>
            <p style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 32rem">
                Hashira is a drawing tool and needs JavaScript to run. The source and documentation
                are at
                <a href="https://github.com/AlanDelValle/hashira">github.com/AlanDelValle/hashira</a
                >.
            </p>
        </noscript>
    </body>
</html>
