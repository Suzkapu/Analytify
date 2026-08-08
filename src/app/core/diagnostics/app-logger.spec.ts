import {createScopedLogger} from './app-logger';

describe('app logger', () => {
  it('adds an ordered Analytify prefix, scope, and level', () => {
    const output = spyOn(globalThis.console, 'info');
    const logger = createScopedLogger('Navigation');

    logger.step('Opening page', {url: '/playlists'});

    expect(output).toHaveBeenCalled();
    const [prefix, message, details] = output.calls.mostRecent().args;
    expect(prefix).toMatch(/^\[Analytify\]\[\d{4}\]\[\+\d+ms\]\[Navigation\]\[STEP\]$/);
    expect(message).toBe('Opening page');
    expect(details).toEqual({url: '/playlists'});
  });

  it('redacts credentials and OAuth values from diagnostic details', () => {
    const output = spyOn(globalThis.console, 'error');
    const logger = createScopedLogger('Authentication');

    logger.error('Callback failed at https://app.test/callback?code=private-code', {
      accessToken: 'private-token',
      safeStatus: 401
    });

    const [, message, details] = output.calls.mostRecent().args;
    expect(message).toContain('code=[REDACTED]');
    expect(message).not.toContain('private-code');
    expect(details).toEqual({accessToken: '[REDACTED]', safeStatus: 401});
  });

  it('keeps error names, messages, and stacks available for debugging', () => {
    const output = spyOn(globalThis.console, 'warn');
    const logger = createScopedLogger('Storage');

    logger.warn('Read failed', new Error('IndexedDB unavailable'));

    const details = output.calls.mostRecent().args[2] as {name: string; message: string; stack?: string};
    expect(details.name).toBe('Error');
    expect(details.message).toBe('IndexedDB unavailable');
    expect(details.stack).toContain('IndexedDB unavailable');
  });
});
