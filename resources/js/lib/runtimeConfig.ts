/**
 * What this deployment is, as opposed to what this build is.
 *
 * The server prints a block of JSON into the page and this reads it, once. Everything in it is
 * a property of the instance the browser is talking to — which is exactly what a bundle cannot
 * know, because the bundle is built by CI and then run by whoever pulled the image. Using
 * `import.meta.env` for these was fine while every instance built its own assets and became
 * wrong the moment one image had to serve every operator: Vite inlines those values, so a
 * published build would carry CI's empty socket key for ever, with no environment variable on
 * the server able to reach it.
 *
 * **Absence is a valid answer.** A unit test renders a component with no page around it, and
 * gets the same thing a deployment with nothing configured gets: the defaults below. Nothing
 * here throws, for the same reason `echo()` hands back `null` rather than throwing — a missing
 * socket is a quieter tool, not a broken one.
 */

export interface RuntimeConfig {
    reverb: {
        /** Empty means there is no socket to talk to. It is the whole switch. */
        key: string;
        host: string;
        port: number;
        scheme: string;
    };
}

const FALLBACK: RuntimeConfig = {
    reverb: { key: '', host: 'localhost', port: 8080, scheme: 'http' },
};

const ELEMENT_ID = 'hashira-config';

let cached: RuntimeConfig | null = null;

/** Read once and keep it: the page is not going to change its mind. */
export function runtimeConfig(): RuntimeConfig {
    cached ??= read();

    return cached;
}

/** For tests, which need to read a page they have only just written. */
export function forgetRuntimeConfig(): void {
    cached = null;
}

function read(): RuntimeConfig {
    if (typeof document === 'undefined') {
        return FALLBACK;
    }

    const element = document.getElementById(ELEMENT_ID);

    if (element === null) {
        return FALLBACK;
    }

    try {
        const parsed: unknown = JSON.parse(element.textContent ?? '');

        return merge(parsed);
    } catch {
        // Malformed configuration is the operator's problem and not the drawing's. Behave as
        // though there were none, which is a running editor with nobody else in it.
        return FALLBACK;
    }
}

/**
 * Field by field, so one bad value costs only that field.
 *
 * The same rule `mergeSettings` follows in the document model, and for the same reason: this
 * is parsing something written elsewhere, and reading it all-or-nothing means one typo in a
 * port number silently takes the socket key down with it.
 */
function merge(parsed: unknown): RuntimeConfig {
    if (typeof parsed !== 'object' || parsed === null) {
        return FALLBACK;
    }

    const reverb = (parsed as { reverb?: unknown }).reverb;

    if (typeof reverb !== 'object' || reverb === null) {
        return FALLBACK;
    }

    const source = reverb as Record<string, unknown>;

    return {
        reverb: {
            key: typeof source.key === 'string' ? source.key : FALLBACK.reverb.key,
            host: typeof source.host === 'string' ? source.host : FALLBACK.reverb.host,
            port: typeof source.port === 'number' ? source.port : FALLBACK.reverb.port,
            scheme: typeof source.scheme === 'string' ? source.scheme : FALLBACK.reverb.scheme,
        },
    };
}
