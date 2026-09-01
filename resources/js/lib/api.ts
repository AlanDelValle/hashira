/**
 * The only place in the client that talks to the server.
 *
 * Authentication is the session cookie, so there is no token to store and nothing to attach
 * by hand; the one piece of bookkeeping is the CSRF header, which Laravel expects to mirror
 * the XSRF-TOKEN cookie it sets on every response.
 */

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

export type ValidationErrors = Record<string, string[]>;

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly errors: ValidationErrors = {},
        readonly payload: unknown = null,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    /** The first message for a field, for rendering next to the input it belongs to. */
    fieldError(field: string): string | undefined {
        return this.errors[field]?.[0];
    }

    get isUnauthenticated(): boolean {
        return this.status === 401;
    }

    get isConflict(): boolean {
        return this.status === 409;
    }
}

function readCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));

    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Laravel sets the XSRF-TOKEN cookie on any response, including the one that served this
 * page — so it is normally already present. `/api/csrf-cookie` is the fallback for the cases
 * where it is not, such as a session that expired while the tab sat open.
 *
 * That route is ours. It used to be Sanctum's, which this application does not install (see
 * architecture.md §2.1): the request only ever succeeded because the SPA catch-all answered
 * it with the whole HTML shell and the session middleware attached the cookie on the way
 * past. Refreshing a cookie should not cost a page download, and it should not depend on a
 * route pattern that has nothing to do with it.
 */
async function csrfToken(): Promise<string | null> {
    const existing = readCookie(CSRF_COOKIE);

    if (existing !== null) {
        return existing;
    }

    await fetch('/api/csrf-cookie', { credentials: 'same-origin' });

    return readCookie(CSRF_COOKIE);
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // A form is sent as a form: the browser writes the multipart boundary itself, and setting
    // a content type here would replace it with one that has no boundary in it.
    const isForm = body instanceof FormData;

    if (body !== undefined && !isForm) {
        headers['Content-Type'] = 'application/json';
    }

    if (method !== 'GET') {
        const token = await csrfToken();

        if (token !== null) {
            headers[CSRF_HEADER] = token;
        }
    }

    const response = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

    if (response.status === 204) {
        return undefined as T;
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(
            response.status,
            messageFrom(payload) ?? `Request failed (${response.status}).`,
            errorsFrom(payload),
            payload,
        );
    }

    return payload as T;
}

function messageFrom(payload: unknown): string | null {
    if (payload !== null && typeof payload === 'object' && 'message' in payload) {
        const { message } = payload;

        return typeof message === 'string' && message.length > 0 ? message : null;
    }

    return null;
}

function errorsFrom(payload: unknown): ValidationErrors {
    if (payload !== null && typeof payload === 'object' && 'errors' in payload) {
        const { errors } = payload;

        if (errors !== null && typeof errors === 'object') {
            return errors as ValidationErrors;
        }
    }

    return {};
}

export const api = {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
    upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
    delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Laravel wraps single resources and collections in a `data` key. */
export interface Envelope<T> {
    data: T;
}
