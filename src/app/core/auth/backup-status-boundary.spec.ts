import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {createClient} from '@supabase/supabase-js';
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from './spotify-auth.service';
import {SessionLifecycleService} from './session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

interface RequestPort {
  url: URL;
  method: string;
  signal?: AbortSignal | null;
  complete: (data: unknown, status?: number) => void;
  aborted: boolean;
}

let fixtureId = 0;

describe('backup status through real Supabase SDK transport and session boundaries', () => {
  let values: Map<string, string>;
  let requests: RequestPort[];
  let auth: SpotifyAuthService;
  let lifecycle: SessionLifecycleService;
  beforeEach(async () => {
    values = new Map(); requests = [];
    const client = createClient('https://isolated.invalid', 'isolated-test-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `isolated-backup-status-${++fixtureId}`},
      global: {fetch: async (input, init) => new Promise<Response>((resolve, reject) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const signal = init?.signal;
        const request: RequestPort = {url, method: init?.method ?? 'GET', signal, aborted: false,
          complete: (data, status = 200) => {
            signal?.removeEventListener('abort', abort);
            resolve(new Response(status === 204 ? null : JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}}));
          }};
        const abort = () => {request.aborted = true; reject(new DOMException('Isolated request aborted', 'AbortError'));};
        requests.push(request);
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
      })}
    });
    TestBed.configureTestingModule({providers: [provideHttpClient(),
      {provide: SupabaseService, useValue: new SupabaseService(async () => client)},
      {provide: StorageService, useValue: {initFromDB: async () => {},
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)}}]});
    auth = TestBed.inject(SpotifyAuthService); lifecycle = TestBed.inject(SessionLifecycleService);
    await auth.restoreSessionFromSupabase();
    values.set('spotifyUserId', 'actor-a'); values.set('supabaseUserId', 'cloud-a');
    values.set('cloud-a_backup_active', 'false');
  });
  afterEach(() => {for (const request of requests) request.complete(null);});
  async function read() {return vi.waitFor(() => {
    const request = requests.find(item => item.method === 'GET' && item.url.pathname === '/rest/v1/users');
    expect(request).toBeDefined(); return request!;
  });}
  const result = {backup_active: true, last_synced_at: '2026-10-09T10:00:00Z'};

  it('applies the current flag/time and cleans only captured normalized user cache keys', async () => {
    const pending = auth.syncBackupActiveStatus(); const request = await read();
    expect(request.url.searchParams.get('id')).toBe('eq.cloud-a');
    request.complete(result);
    const cleanup = await vi.waitFor(() => {
      const request = requests.find(item => item.method === 'DELETE'); expect(request).toBeDefined(); return request!;
    });
    expect(cleanup.url.pathname).toBe('/rest/v1/user_cache');
    expect(cleanup.url.searchParams.get('user_id')).toBe('eq.cloud-a');
    expect(cleanup.url.searchParams.get('key')).toContain('actor-a_recently_played');
    expect(cleanup.url.searchParams.get('key')).not.toContain('actor-b');
    cleanup.complete(null, 204); await pending;
    expect(values.get('cloud-a_backup_active')).toBe('true');
    expect(values.get('cloud-a_last_synced_at')).toBe(result.last_synced_at);
    expect(auth.backupActivationState).toBe('active');
  });

  it.each(['spotify', 'cloud', 'generation'])('rejects a late successful read after %s replacement', async replacement => {
    const pending = auth.syncBackupActiveStatus(); const request = await read();
    if (replacement === 'spotify') values.set('spotifyUserId', 'actor-b');
    if (replacement === 'cloud') values.set('supabaseUserId', 'cloud-b');
    if (replacement === 'generation') await lifecycle.invalidateAndDrain();
    request.complete(result);
    // If the original implementation starts cleanup, release it so the desired
    // assertion reports the stale effect rather than hanging the test.
    let settled = false;
    void pending.then(() => {settled = true;});
    await vi.waitFor(() => {
      for (const item of requests.filter(item => item.method === 'DELETE')) item.complete(null, 204);
      expect(settled).toBe(true);
    });
    expect(requests.filter(item => item.method === 'DELETE')).toHaveLength(0);
    expect(values.get('cloud-a_backup_active')).toBe('false');
    expect(values.has('cloud-a_last_synced_at')).toBe(false);
    expect(auth.backupActivationState).toBe('idle');
  });

  it('aborts the actual pending status transport when the session ends', async () => {
    const pending = auth.syncBackupActiveStatus(); const request = await read();
    await lifecycle.invalidateAndDrain();
    const aborted = request.aborted;
    request.complete(null); await pending;
    expect(aborted).toBe(true);
    expect(requests.filter(item => item.method === 'DELETE')).toHaveLength(0);
    expect(values.get('cloud-a_backup_active')).toBe('false');
  });

  it('cancels pending normalized-cache cleanup on session end', async () => {
    const pending = auth.syncBackupActiveStatus(); (await read()).complete(result);
    const cleanup = await vi.waitFor(() => {
      const request = requests.find(item => item.method === 'DELETE'); expect(request).toBeDefined(); return request!;
    });
    await lifecycle.invalidateAndDrain(); const aborted = cleanup.aborted;
    cleanup.complete(null, 204); await pending;
    expect(aborted).toBe(true);
    expect(requests.filter(item => item.method === 'DELETE')).toHaveLength(1);
  });

  it('allows logout to drain initial sync by aborting its transport', async () => {
    const initial = auth.ensureInitialSync();
    const rejected = expect(initial).rejects.toMatchObject({name: 'AbortError'});
    const request = await read(); const exit = auth.logout();
    // Invalidation is synchronous; release the baseline's un-aborted request
    // only after observing it, so a failing baseline cannot hang teardown.
    const aborted = request.aborted;
    request.complete(null); await rejected; await exit;
    expect(aborted).toBe(true);
    expect(auth.getUserId()).toBeNull(); expect(auth.getSupabaseUserId()).toBeNull();
    expect(requests.filter(item => item.method === 'DELETE')).toHaveLength(0);
  });

  it('starts a fresh initial status read for the account signed in after logout', async () => {
    const initial = auth.ensureInitialSync();
    const rejected = expect(initial).rejects.toMatchObject({name: 'AbortError'});
    await read(); await auth.logout(); await rejected;
    values.set('spotifyUserId', 'actor-b'); values.set('supabaseUserId', 'cloud-b');
    const current = auth.ensureInitialSync();
    const settled = current.catch(() => {});
    const fresh = await vi.waitFor(() => {
      const request = requests.find(item => item.url.searchParams.get('id') === 'eq.cloud-b');
      expect(request).toBeDefined(); return request!;
    });
    fresh.complete(null); await settled; await expect(current).resolves.toBeUndefined();
    expect(current).not.toBe(initial);
    expect(requests.filter(item => item.method === 'GET')).toHaveLength(2);
    expect(values.get('cloud-a_backup_active')).toBeUndefined();
    expect(auth.getUserId()).toBe('actor-b');
  });

  it.each(['cloud', 'generation'])('does not start the read after %s changes during client readiness', async replacement => {
    const supabase = TestBed.inject(SupabaseService); const client = await supabase.getClient();
    let ready!: (value: typeof client) => void;
    vi.spyOn(supabase, 'getClient').mockReturnValueOnce(new Promise(resolve => {ready = resolve;}));
    const pending = auth.syncBackupActiveStatus();
    if (replacement === 'cloud') values.set('supabaseUserId', 'cloud-b');
    else await lifecycle.invalidateAndDrain();
    ready(client); await pending;
    expect(requests).toHaveLength(0); expect(values.get('cloud-a_backup_active')).toBe('false');
  });

  it('does not send cleanup after cancellation during client readiness', async () => {
    const supabase = TestBed.inject(SupabaseService); const client = await supabase.getClient();
    let ready!: (value: typeof client) => void;
    vi.spyOn(supabase, 'getClient').mockReturnValueOnce(new Promise(resolve => {ready = resolve;}));
    const controller = new AbortController();
    const pending = supabase.deleteUserCacheEntries('cloud-a', ['normalized-key'], controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    controller.abort(new DOMException('Session ended', 'AbortError')); ready(client); await rejected;
    expect(requests).toHaveLength(0);
  });

  it('preserves cache cleanup callers without a signal and de-duplicates the requested keys', async () => {
    const pending = TestBed.inject(SupabaseService).deleteUserCacheEntries('cloud-a', ['one', 'one', '', 'two']);
    const cleanup = await vi.waitFor(() => {
      const request = requests.find(item => item.method === 'DELETE'); expect(request).toBeDefined(); return request!;
    });
    expect(cleanup.url.pathname).toBe('/rest/v1/user_cache');
    expect(cleanup.url.searchParams.get('user_id')).toBe('eq.cloud-a');
    expect(cleanup.url.searchParams.get('key')).toBe('in.(one,two)');
    cleanup.complete(null, 204); await pending;
    expect(requests).toHaveLength(1);
  });

  it.each([200, 403])('preserves cached state without cleanup after empty/denied status (%s)', async status => {
    const pending = auth.syncBackupActiveStatus(); const request = await read();
    request.complete(status === 200 ? null : {message: 'Isolated read denied', code: '42501'}, status);
    await pending;
    expect(values.get('cloud-a_backup_active')).toBe('false');
    expect(values.has('cloud-a_last_synced_at')).toBe(false);
    expect(requests.filter(item => item.method === 'DELETE')).toHaveLength(0);
  });
});
