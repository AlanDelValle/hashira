/**
 * Regenerates every picture of the product that the project ships: the README's screenshots,
 * and the drawing on the landing page.
 *
 * Pictures made by hand go stale the moment the interface moves, and nobody notices until the
 * page is advertising something that no longer exists — or, as happened here, something that
 * never existed at all, because the landing page's hand-drawn plan promised a dimension for
 * months before the editor could produce one. Everything written here comes out of a running
 * instance instead: the screenshots by photographing it, the landing drawing by asking the
 * editor's own exporter for it.
 *
 *   npm run artwork
 *
 * It needs the application running (Herd at http://hashira.test, or APP_URL set to wherever
 * it is), a seeded demo account, and Chrome. Nothing is installed: the browser is driven over
 * the DevTools protocol using Node's own WebSocket client.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = (process.env.APP_URL ?? 'http://hashira.test').replace(/\/$/, '');
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@hashira.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'password';
const OUT_DIR = 'docs/images';
/** The landing page shows the editor's own output, so this is written, not drawn. */
const LANDING_SVG = 'resources/js/pages/landing/plan.svg';
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

        // Signed out first, because that is how the landing page is met.
        await capture(
            page,
            `${BASE_URL}/`,
            'landing',
            '(() => { const plan = document.querySelector("main img"); return document.querySelector("h1") !== null && plan !== null && plan.complete && plan.naturalWidth > 0; })()',
        );

        await signIn(page);

        await capture(
            page,
            `${BASE_URL}/projects`,
            'dashboard',
            'document.querySelectorAll("main a[href^=\'/projects/\']").length > 0',
        );

        // A picture of the editor wants a drawing in it, and the account has an empty project
        // as well. Each is opened in turn until one has something on the sheet, rather than
        // trusting whichever order the dashboard happens to list them in.
        const projects = await evaluate(
            page,
            '[...document.querySelectorAll("main a[href^=\'/projects/\']")].map((a) => a.getAttribute("href"))',
        );

        await captureFirstDrawing(page, projects);
        await exportPlanSvg(page);

        console.log(
            `Wrote ${OUT_DIR}/landing.png, ${OUT_DIR}/editor.png, ${OUT_DIR}/dashboard.png` +
                ` and ${LANDING_SVG}.`,
        );
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

/**
 * Opens each project until one turns out to have a drawing, and photographs that. The canvas
 * is painted outside React, so "the page has rendered" is not the same as "the drawing is on
 * screen" — the status bar's own element count is the honest signal that it is.
 */
async function captureFirstDrawing(page, projects) {
    const drawn =
        'document.querySelector("canvas") !== null && !/(^|\\s)0 elements/.test(document.body.innerText)';

    for (const project of projects) {
        await page.send('Page.navigate', { url: `${BASE_URL}${project}` });

        try {
            await waitFor(page, drawn, '', 20);
        } catch {
            continue;
        }

        await capture(page, `${BASE_URL}${project}`, 'editor', drawn);

        return;
    }

    throw new Error('None of the demo projects has a drawing in it — is the database seeded?');
}

/**
 * Asks the editor to export the drawing it currently has open, and writes the result straight
 * into the landing page's folder.
 *
 * The export arrives as a download the page starts itself, which is awkward to catch in a
 * headless browser and pointless to route through the filesystem twice — so the anchor click
 * is intercepted and the blob read back. Nothing here reimplements the exporter: the bytes are
 * the ones a person clicking Export would have received.
 */
async function exportPlanSvg(page) {
    await evaluate(
        page,
        `(() => {
            window.__svg = null;
            const realClick = HTMLAnchorElement.prototype.click;

            HTMLAnchorElement.prototype.click = function () {
                if (this.download?.endsWith('.svg')) {
                    window.__svg = fetch(this.href).then((response) => response.text());

                    return;
                }

                return realClick.call(this);
            };

            return true;
        })()`,
    );

    // Radix opens on pointerdown, so a synthetic click never reaches it.
    await clickElement(page, 'button[aria-label="Export"]');
    await waitFor(page, 'document.querySelector(\'[role="dialog"]\') !== null');
    await pause(300);

    // The export dialog: choose the format, then run it.
    await clickElement(
        page,
        '[role="dialog"] button',
        (item) => `${item}.innerText.startsWith("SVG")`,
    );
    await pause(200);
    await clickElement(
        page,
        '[role="dialog"] button',
        (item) => `${item}.innerText.trim() === "Export"`,
    );

    const svg = await evaluate(page, 'window.__svg');

    if (typeof svg !== 'string' || !svg.includes('<svg')) {
        throw new Error('The editor did not hand back an SVG.');
    }

    writeFileSync(LANDING_SVG, svg, 'utf8');
}

/** Clicks something by where it is on screen, which is the only kind of click Radix believes. */
async function clickElement(page, selector, match = null) {
    const at = await evaluate(
        page,
        `(() => {
            const found = [...document.querySelectorAll(${JSON.stringify(selector)})]
                .find((item) => ${match === null ? 'true' : match('item')});

            if (found === undefined) return null;

            const box = found.getBoundingClientRect();

            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        })()`,
    );

    if (at === null) {
        throw new Error(`Nothing on the page matched ${selector}.`);
    }

    for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', {
            type,
            x: at.x,
            y: at.y,
            button: 'left',
            clickCount: 1,
            buttons: type === 'mousePressed' ? 1 : 0,
        });
    }

    await pause(400);
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

async function waitFor(
    page,
    expression,
    message = `Timed out waiting for: ${expression}`,
    attempts = 120,
) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            if ((await evaluate(page, expression)) === true) {
                return;
            }
        } catch {
            /* The page may be mid-navigation; ask again. */
        }

        await pause(150);
    }

    throw new Error(message === '' ? `Timed out waiting for: ${expression}` : message);
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
