import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { api } from '@/lib/api';

/**
 * The socket, if there is one.
 *
 * **Presence is optional and the editor must not notice its absence.** A checkout with no
 * `VITE_REVERB_APP_KEY` — which is what a fresh clone and CI both get — never opens a
 * connection at all, and everything else works exactly as it did. That is deliberate: a
 * drawing tool that will not start because a websocket server is down is a worse tool than one
 * that quietly has nobody else in it.
 *
 * So this hands back `null` rather than throwing, and every caller is written to accept that.
 *
 * Authorization goes through `lib/api` rather than Echo's own request, because that module is
 * the one place in the client that talks to the server: it already knows about the session
 * cookie, the CSRF header and what a 401 means, and a second HTTP path would be a second set
 * of those rules to keep in step.
 */

declare global {
    interface Window {
        Pusher: typeof Pusher;
    }
}

interface AuthResponse {
    auth: string;
    channel_data?: string;
}

let instance: Echo<'reverb'> | null = null;
let attempted = false;

/** Whether this build was given a socket to talk to at all. */
export function presenceIsConfigured(): boolean {
    return String(import.meta.env.VITE_REVERB_APP_KEY ?? '') !== '';
}

export function echo(): Echo<'reverb'> | null {
    if (attempted) {
        return instance;
    }

    attempted = true;

    if (!presenceIsConfigured()) {
        return null;
    }

    window.Pusher = Pusher;

    const scheme = String(import.meta.env.VITE_REVERB_SCHEME ?? 'http');

    try {
        instance = new Echo({
            broadcaster: 'reverb',
            key: String(import.meta.env.VITE_REVERB_APP_KEY),
            wsHost: String(import.meta.env.VITE_REVERB_HOST ?? 'localhost'),
            wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
            wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
            forceTLS: scheme === 'https',
            enabledTransports: ['ws', 'wss'],
            authorizer: (channel: { name: string }) => ({
                authorize: (
                    socketId: string,
                    callback: (error: Error | null, data: AuthResponse | null) => void,
                ) => {
                    void api
                        .post<AuthResponse>('/broadcasting/auth', {
                            socket_id: socketId,
                            channel_name: channel.name,
                        })
                        .then((data) => callback(null, data))
                        .catch((error: unknown) => {
                            callback(error instanceof Error ? error : new Error('Denied'), null);
                        });
                },
            }),
        });
    } catch {
        // A socket that cannot be built is a socket nobody has. Nothing else changes.
        instance = null;
    }

    return instance;
}
