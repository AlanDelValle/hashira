import { defineConfig, devices } from '@playwright/test';

/**
 * One honest path through the whole application.
 *
 * Everything else in the suite runs against a part: geometry without a canvas, commands
 * without a store, a panel without a server. This runs against all of it at once — a real
 * browser, a real Laravel process, a real PostgreSQL — because the thing most worth knowing is
 * whether somebody can draw a wall and still find it after a reload, and no unit test can say.
 *
 * It is deliberately one path. A suite of end-to-end tests is slow, flaky and duplicates
 * coverage that is cheaper elsewhere; a single one that never breaks for a silly reason is
 * something people will actually keep green.
 */

const PORT = 8123;

export default defineConfig({
    testDir: './e2e',

    // One drawing at a time, in one browser. The subject is a stateful editor talking to one
    // database; parallelism here buys seconds and costs afternoons.
    fullyParallel: false,
    workers: 1,

    forbidOnly: process.env.CI !== undefined,
    retries: process.env.CI !== undefined ? 1 : 0,
    reporter: process.env.CI !== undefined ? 'github' : 'list',

    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // Kept only for the run that failed and was retried, which is the one worth opening.
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            // Wide enough for the editor, which refuses to build itself below 64rem and says so.
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
    ],

    webServer: {
        command: `php artisan serve --host=127.0.0.1 --port=${PORT}`,
        url: `http://127.0.0.1:${PORT}/up`,
        reuseExistingServer: process.env.CI === undefined,
        env: {
            /*
             * This run registers an account and saves a drawing for real. It does that in the
             * database the test suites already own rather than in the one being drawn in, so
             * running it locally does not leave junk projects on the dashboard.
             */
            DB_DATABASE: process.env.DB_DATABASE ?? 'hashira_testing',

            /*
             * And it is told where it is being served rather than inheriting whatever `.env`
             * happens to say. Laravel builds asset URLs on APP_URL's scheme, so an `.env`
             * written for Herd — `https://hashira.test` — has this server emitting
             * `https://127.0.0.1:8123/build/…` from a socket that speaks no TLS. Nothing
             * loads, the page stays blank, and the failure reads as "the register form never
             * appeared", which is a long way from the cause. CI copies `.env.example`, which
             * is where it bit first: locally the file said `http` and the run passed.
             */
            APP_URL: `http://127.0.0.1:${PORT}`,
        },
    },
});
