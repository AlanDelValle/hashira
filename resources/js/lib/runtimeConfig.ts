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
    /**
     * Which source this instance is running, for the offer the AGPL asks us to make.
     *
     * `version` and `commit` are empty in a checkout and in an image somebody built for
     * themselves, which is the honest answer: the offer then points at the repository without
     * claiming to know what is deployed.
     */
    source: {
        repository: string;
        version: string;
        commit: string;
    };
}

const FALLBACK: RuntimeConfig = {
    reverb: { key: '', host: 'localhost', port: 8080, scheme: 'http' },
    source: { repository: 'https://github.com/AlanDelValle/hashira', version: '', commit: '' },
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

    const reverb = fields(parsed, 'reverb');
    const source = fields(parsed, 'source');

    return {
        reverb: {
            key: text(reverb.key, FALLBACK.reverb.key),
            host: text(reverb.host, FALLBACK.reverb.host),
            port: typeof reverb.port === 'number' ? reverb.port : FALLBACK.reverb.port,
            scheme: text(reverb.scheme, FALLBACK.reverb.scheme),
        },
        source: {
            repository: text(source.repository, FALLBACK.source.repository),
            version: text(source.version, FALLBACK.source.version),
            commit: text(source.commit, FALLBACK.source.commit),
        },
    };
}

/** @returns the named object's fields, or none, so a missing block reads as every field absent. */
function fields(parsed: object, name: string): Record<string, unknown> {
    const value = (parsed as Record<string, unknown>)[name];

    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}
