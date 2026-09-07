import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { api } from '@/lib/api';
import { runtimeConfig } from '@/lib/runtimeConfig';

/**
 * The socket, if there is one.
 *
 * **Presence is optional and the editor must not notice its absence.** An instance with no
 * `REVERB_APP_KEY` — which is what a fresh clone and CI both get — never opens a connection at
 * all, and everything else works exactly as it did. That is deliberate: a drawing tool that
 * will not start because a websocket server is down is a worse tool than one that quietly has
 * nobody else in it.
 *
 * The key is read from the page rather than from `import.meta.env`, because a build is not a
 * deployment: one published image serves every operator, and each of them has a different
 * answer. See `lib/runtimeConfig.ts`.
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

/** Whether this instance was given a socket to talk to at all. */
export function presenceIsConfigured(): boolean {
    return runtimeConfig().reverb.key !== '';
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

    const { key, host, port, scheme } = runtimeConfig().reverb;

    try {
        instance = new Echo({
            broadcaster: 'reverb',
            key,
            wsHost: host,
            wsPort: port,
            wssPort: port,
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

/**
 * Whether the socket is up, as it changes.
 *
 * Pusher's connection reports its own state — connecting, connected, unavailable, failed — and
 * this passes that through as the one thing anybody here needs to know. A build with no socket
 * never reports anything, and callers are written for that: silence is the same as "there is
 * nobody to be disconnected from".
 */
export function onConnectionState(listener: (connected: boolean) => void): () => void {
    const client = echo();

    if (client === null) {
        return () => {
            /* Nothing was ever bound. */
        };
    }

    const connection = (
        client as unknown as {
            connector?: { pusher?: { connection?: Pusher['connection'] } };
        }
    ).connector?.pusher?.connection;

    if (connection === undefined) {
        return () => {
            /* Nothing was ever bound. */
        };
    }

    const handler = ({ current }: { current: string }) => listener(current === 'connected');

    connection.bind('state_change', handler);

    return () => connection.unbind('state_change', handler);
}
