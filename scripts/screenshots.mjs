/**
 * Regenerates the screenshots in the README.
 *
 * Hand-captured screenshots go stale the moment the interface moves, and nobody notices until
 * the README is describing a product that no longer exists. This drives a real browser against
 * a real local instance and writes the images the README points at, so refreshing them is one
 * command rather than an afternoon with a cropping tool.
 *
 *   npm run screenshots
 *
 * It needs the application running (Herd at https://hashira.test, or APP_URL set to wherever
 * it is), a seeded demo account, and Chrome. Nothing is installed: the browser is driven over
 * the DevTools protocol using Node's own WebSocket client.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = (process.env.APP_URL ?? 'https://hashira.test').replace(/\/$/, '');
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@hashira.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'password';
const OUT_DIR = 'docs/images';
const PORT = Number(process.env.CDP_PORT ?? 9222);

/** A wide laptop: enough sheet to be worth photographing, not so wide the panels look lost. */
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
];

main().catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});

async function main() {
    const binary = CHROME_CANDIDATES.find((path) => path !== undefined && existsSync(path));

    if (binary === undefined) {
        throw new Error('No Chrome found. Set CHROME_PATH to its executable.');
    }

    mkdirSync(OUT_DIR, { recursive: true });

    const profile = join(tmpdir(), `hashira-shots-${process.pid}`);
    const chrome = spawn(
        binary,
        [
            '--headless=new',
            `--remote-debugging-port=${PORT}`,
            `--user-data-dir=${profile}`,
            // Herd serves a locally trusted certificate that a fresh, empty profile has never
            // been told about.
            '--ignore-certificate-errors',
            '--hide-scrollbars',
            '--disable-gpu',
            '--no-first-run',
            'about:blank',
        ],
        { stdio: 'ignore' },
    );

    let page;

    try {
        page = await connect();

        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Emulation.setDeviceMetricsOverride', { mobile: false, ...VIEWPORT });

        await signIn(page);

        await capture(
            page,
            `${BASE_URL}/projects`,
            'dashboard',
            'document.querySelectorAll("main a[href^=\'/projects/\']").length > 0',
        );

        const project = await evaluate(
            page,
            'document.querySelector("main a[href^=\'/projects/\']").getAttribute("href")',
        );

        // The canvas is painted outside React, so "the page has rendered" is not the same as
        // "the drawing is on screen". The status bar's own element count is the honest signal.
        await capture(
            page,
            `${BASE_URL}${project}`,
            'editor',
            'document.querySelector("canvas") !== null && !/(^|\\s)0 elements/.test(document.body.innerText)',
        );

        console.log(`Wrote ${OUT_DIR}/editor.png and ${OUT_DIR}/dashboard.png.`);
    } finally {
        page?.close();
        chrome.kill();

        // The profile is a temporary directory; Chrome may still be letting go of it, and a
        // stray one is not worth failing a successful run over.
        await pause(500);

        try {
            rmSync(profile, { recursive: true, force: true });
        } catch {
            /* Left behind in the temporary directory, where it will be cleaned up anyway. */
        }
    }
}

async function capture(page, url, name, condition) {
    await page.send('Page.navigate', { url });
    await waitFor(page, condition);

    // A moment past the condition, so nothing is captured mid-transition.
    await pause(500);

    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });

    writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
}

async function signIn(page) {
    await page.send('Page.navigate', { url: `${BASE_URL}/login` });
    await waitFor(page, 'document.querySelector("input[type=\'password\']") !== null');

    // React owns these inputs, so the native setter is used and an input event dispatched —
    // assigning `value` directly would leave the component's own state behind.
    await evaluate(
        page,
        `(() => {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            const fill = (selector, value) => {
                const field = document.querySelector(selector);
                set.call(field, value);
                field.dispatchEvent(new Event('input', { bubbles: true }));
            };
            fill("input[type='email']", ${JSON.stringify(EMAIL)});
            fill("input[type='password']", ${JSON.stringify(PASSWORD)});
            document.querySelector('form button[type=submit]').click();
            return true;
        })()`,
    );

    await waitFor(
        page,
        'location.pathname === "/projects"',
        'Sign-in did not reach the dashboard.',
    );
}

async function waitFor(page, expression, message = `Timed out waiting for: ${expression}`) {
    for (let attempt = 0; attempt < 120; attempt++) {
        try {
            if ((await evaluate(page, expression)) === true) {
                return;
            }
        } catch {
            /* The page may be mid-navigation; ask again. */
        }

        await pause(150);
    }

    throw new Error(message);
}

async function evaluate(page, expression) {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });

    if (exceptionDetails !== undefined) {
        throw new Error(exceptionDetails.text ?? 'Evaluation failed');
    }

    return result.value;
}

function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Attaches to the browser's first page target. */
async function connect() {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const targets = await response.json();
            const target = targets.find((entry) => entry.type === 'page');

            if (target !== undefined) {
                return await open(target.webSocketDebuggerUrl);
            }
        } catch {
            /* Chrome is still starting. */
        }

        await pause(250);
    }

    throw new Error('Could not attach to Chrome.');
}

function open(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const pending = new Map();
        let nextId = 0;

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data));
            const waiting = pending.get(message.id);

            if (waiting === undefined) {
                return;
            }

            pending.delete(message.id);

            if (message.error !== undefined) {
                waiting.reject(new Error(message.error.message));
            } else {
                waiting.resolve(message.result);
            }
        });

        socket.addEventListener('error', () => reject(new Error('DevTools socket failed.')));

        socket.addEventListener('open', () => {
            resolve({
                send: (method, params = {}) =>
                    new Promise((res, rej) => {
                        const id = ++nextId;
                        pending.set(id, { resolve: res, reject: rej });
                        socket.send(JSON.stringify({ id, method, params }));
                    }),
                close: () => socket.close(),
            });
        });
    });
}
