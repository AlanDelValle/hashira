import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
            fonts: [
                // UI face: a neutral grotesk with enough character not to read as a default.
                bunny('Instrument Sans', { weights: [400, 500, 600] }),
                // Numeric face: every measurement, coordinate and dimension is tabular.
                bunny('JetBrains Mono', { weights: [400, 500] }),
            ],
        }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
    },
    server: {
        /*
         * Pinned to IPv4 loopback.
         *
         * Left to itself this machine's Vite binds to `::1` and writes that literal into
         * public/hot, so Blade emits `http://[::1]:5173/...`. Browsers will not load module
         * scripts from a bare IPv6 literal on a page served from another origin, which shows
         * up as a blank page with no useful error. `localhost` is a name every browser and
         * every proxy already agrees about.
         */
        host: 'localhost',
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
