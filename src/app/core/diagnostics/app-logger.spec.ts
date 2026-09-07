import { describe, expect, it, vi } from "vitest";
import { createScopedLogger } from './app-logger';

describe('app logger', () => {
    it('adds an ordered Analytify prefix, scope, and level', () => {
        const output = vi.spyOn(globalThis.console, 'info').mockReturnValue(undefined);
        const logger = createScopedLogger('Navigation');

        logger.step('Opening page', { url: '/playlists' });

        expect(output).toHaveBeenCalled();
        const [prefix, message, details] = vi.mocked(output).mock.lastCall!;
        expect(prefix).toMatch(/^\[Analytify\]\[\d{4}\]\[\+\d+ms\]\[Navigation\]\[STEP\]$/);
        expect(message).toBe('Opening page');
        expect(details).toEqual({ url: '/playlists' });
    });

    it('redacts credentials and OAuth values from diagnostic details', () => {
        const output = vi.spyOn(globalThis.console, 'error').mockReturnValue(undefined);
        const logger = createScopedLogger('Authentication');

        logger.error('Callback failed at https://app.test/callback?code=private-code', {
            accessToken: 'private-token',
            safeStatus: 401
        });

        const [, message, details] = vi.mocked(output).mock.lastCall!;
        expect(message).toContain('code=[REDACTED]');
        expect(message).not.toContain('private-code');
        expect(details).toEqual({ accessToken: '[REDACTED]', safeStatus: 401 });
    });

    it('keeps error names, messages, and stacks available for debugging', () => {
        const output = vi.spyOn(globalThis.console, 'warn').mockReturnValue(undefined);
        const logger = createScopedLogger('Storage');

        logger.warn('Read failed', new Error('IndexedDB unavailable'));

        const details = vi.mocked(output).mock.lastCall![2] as {
            name: string;
            message: string;
            stack?: string;
        };
        expect(details.name).toBe('Error');
        expect(details.message).toBe('IndexedDB unavailable');
        expect(details.stack).toContain('IndexedDB unavailable');
    });
});
