import { afterEach, describe, expect, it } from 'vitest';

import { forgetRuntimeConfig, runtimeConfig } from '@/lib/runtimeConfig';

/*
 * Phase 10.1a. This is what a published image depends on: the browser learning which socket
 * this instance has from the page it was served, rather than from the bundle it was built
 * into. Every failure mode here ends the same way — no socket — because a drawing tool that
 * will not start is worse than one that quietly has nobody else in it.
 */

function serve(json: string): void {
    const element = document.createElement('script');

    element.id = 'hashira-config';
    element.type = 'application/json';
    element.textContent = json;

    document.head.append(element);
    forgetRuntimeConfig();
}

afterEach(() => {
    document.getElementById('hashira-config')?.remove();
    forgetRuntimeConfig();
});

describe('runtimeConfig', () => {
    it('reads what the server printed into the page', () => {
        serve(
            JSON.stringify({
                reverb: { key: 'abc123', host: 'hashira.example.com', port: 443, scheme: 'https' },
            }),
        );

        expect(runtimeConfig().reverb).toEqual({
            key: 'abc123',
            host: 'hashira.example.com',
            port: 443,
            scheme: 'https',
        });
    });

    it('has no socket when the page carries no configuration at all', () => {
        forgetRuntimeConfig();

        expect(runtimeConfig().reverb.key).toBe('');
    });

    it('has no socket when the configuration is not JSON', () => {
        serve('{ this is not json');

        expect(runtimeConfig().reverb.key).toBe('');
    });

    /*
     * Field by field, like `mergeSettings` in the document model: a port somebody typed as a
     * string is one wrong field, not a socket that vanishes.
     */
    it('keeps the fields it can read when one of them is wrong', () => {
        serve(JSON.stringify({ reverb: { key: 'abc123', port: '443' } }));

        expect(runtimeConfig().reverb.key).toBe('abc123');
        expect(runtimeConfig().reverb.port).toBe(8080);
    });

    it('reads the page once', () => {
        serve(JSON.stringify({ reverb: { key: 'first' } }));

        expect(runtimeConfig().reverb.key).toBe('first');

        document.getElementById('hashira-config')!.textContent = JSON.stringify({
            reverb: { key: 'second' },
        });

        expect(runtimeConfig().reverb.key).toBe('first');
    });
});

describe('the source offer', () => {
    it('carries the version and commit the image was built from', () => {
        serve(
            JSON.stringify({
                source: {
                    repository: 'https://example.com/fork',
                    version: 'v0.10.0',
                    commit: 'abc1234',
                },
            }),
        );

        expect(runtimeConfig().source).toEqual({
            repository: 'https://example.com/fork',
            version: 'v0.10.0',
            commit: 'abc1234',
        });
    });

    /*
     * An image somebody built themselves knows neither, and saying so is the point: the footer
     * then offers the repository rather than linking a commit that is not what is running.
     */
    it('claims no version when the build did not know one', () => {
        serve(JSON.stringify({ reverb: { key: 'abc123' } }));

        expect(runtimeConfig().source.version).toBe('');
        expect(runtimeConfig().source.commit).toBe('');
        expect(runtimeConfig().source.repository).toContain('github.com');
    });
});
