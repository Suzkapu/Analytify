import {TestBed} from '@angular/core/testing';
import {SwPush} from '@angular/service-worker';
import {createClient} from '@supabase/supabase-js';
import {defer, of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PushNotificationService} from './push-notification.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
interface RequestPort {
  name: string; body: unknown; actor: string | null; cloud: string | null;
  signal?: AbortSignal | null; aborted: boolean;
  complete: (data: unknown) => void;
}
let fixtureId = 0;
const subscription = {endpoint: 'https://push.example/isolated-device',
  toJSON: () => ({endpoint: 'https://push.example/isolated-device', keys: {p256dh: 'test-key', auth: 'test-secret'}})} as unknown as PushSubscription;
const settings = [{song_league_enabled: true, song_league_song_added_enabled: false,
  song_league_member: true, stats_access_requests_enabled: false, device_registered: false, registered_device_count: 0}];

describe('notification effects across real client transport and session changes', () => {
  let actor: string | null; let cloud: string | null;
  let requests: RequestPort[]; let service: PushNotificationService; let lifecycle: SessionLifecycleService;
  let ready: ReturnType<typeof deferred<void>>; let delayClient: boolean; let completeSuccessors: boolean;
  let requestSubscription: ReturnType<typeof vi.fn>; let browserSubscription: PushSubscription | null;
  beforeEach(() => {
    actor = 'actor-a'; cloud = 'cloud-a'; requests = []; delayClient = false; completeSuccessors = false;
    ready = deferred<void>(); browserSubscription = null;
    requestSubscription = vi.fn().mockResolvedValue(subscription);
    vi.spyOn(navigator.permissions, 'query').mockReset().mockResolvedValue({state: 'granted'} as PermissionStatus);
    const client = createClient('https://isolated.invalid', 'test-only-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `notification-boundary-${++fixtureId}`},
      global: {fetch: async (input, init) => new Promise<Response>((resolve, reject) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.origin !== 'https://isolated.invalid' || !url.pathname.startsWith('/rest/v1/rpc/')) throw new Error('Unexpected isolated request');
        const signal = init?.signal;
        const abort = () => {request.aborted = true; reject(new DOMException('Test transport aborted', 'AbortError'));};
        const request: RequestPort = {name: url.pathname.split('/').at(-1)!, body: JSON.parse(String(init?.body)), actor, cloud,
          signal, aborted: false, complete: data => {
            signal?.removeEventListener('abort', abort);
            resolve(new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}}));
          }};
        requests.push(request);
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
        if (completeSuccessors) request.complete(request.name === 'get_notification_settings' ? settings : null);
      })}
    });
    TestBed.configureTestingModule({providers: [PushNotificationService,
      {provide: SpotifyAuthService, useValue: {getUserId: () => actor, getSupabaseUserId: () => cloud}},
      {provide: SwPush, useValue: {isEnabled: true, subscription: defer(() => of(browserSubscription)), requestSubscription}},
      {provide: SupabaseService, useValue: new SupabaseService(async () => {if (delayClient) await ready.promise; return client;})}]});
    service = TestBed.inject(PushNotificationService); lifecycle = TestBed.inject(SessionLifecycleService);
  });
  afterEach(() => {ready.resolve(); for (const request of requests) request.complete(null);});
  async function request(name: string) {
    return vi.waitFor(() => {const found = requests.find(item => item.name === name); expect(found).toBeDefined(); return found!;});
  }
  async function replace(kind: 'actor' | 'cloud' | 'generation') {
    if (kind === 'actor') actor = 'actor-b'; else if (kind === 'cloud') cloud = 'cloud-b';
    else await lifecycle.invalidateAndDrain();
  }
  const outcome = <T>(pending: Promise<T>) => pending.then(value => ({value, error: null}), error => ({value: null, error}));

  it.each(['actor', 'cloud', 'generation'] as const)('does not save using a replacement %s after lazy client initialization', async kind => {
    delayClient = true;
    const pending = outcome(service.setCategoryPreference('song_league', false));
    await replace(kind); completeSuccessors = true; ready.resolve();
    const result = await pending;
    expect(result.error).toMatchObject({name: 'AbortError'}); expect(requests).toEqual([]);
  });
  it.each(['actor', 'cloud', 'generation'] as const)('does not register a prompted device for replacement %s', async kind => {
    const prompt = deferred<PushSubscription>(); requestSubscription.mockReturnValue(prompt.promise);
    const pending = outcome(service.enableDevice()); await vi.waitFor(() => expect(requestSubscription).toHaveBeenCalledOnce());
    await replace(kind); completeSuccessors = true; prompt.resolve(subscription);
    const result = await pending;
    expect(result.error).toMatchObject({name: 'AbortError'}); expect(requests).toEqual([]);
  });
  it.each(['actor', 'cloud', 'generation'] as const)('does not repair device registration from a stale %s read', async kind => {
    browserSubscription = subscription;
    const pending = outcome(service.loadSettings()); const read = await request('get_notification_settings');
    await replace(kind); completeSuccessors = true; read.complete(settings);
    expect((await pending).error).toMatchObject({name: 'AbortError'});
    expect(requests.map(item => item.name)).toEqual(['get_notification_settings']);
  });
  it.each(['actor', 'cloud', 'generation'] as const)('does not recover a rejected old permission prompt using replacement %s', async kind => {
    const prompt = deferred<PushSubscription>(); requestSubscription.mockReturnValue(prompt.promise);
    const pending = outcome(service.enableDevice()); await vi.waitFor(() => expect(requestSubscription).toHaveBeenCalledOnce());
    await replace(kind); browserSubscription = subscription; completeSuccessors = true; prompt.reject(new Error('Old browser prompt rejected'));
    expect((await pending).error).toMatchObject({name: 'AbortError'}); expect(requests).toEqual([]);
  });
  it.each(['actor', 'cloud', 'generation'] as const)('does not open a permission prompt after delayed %s permission inspection', async kind => {
    const permission = deferred<PermissionStatus>(); vi.mocked(navigator.permissions.query).mockReturnValueOnce(permission.promise);
    const pending = outcome(service.enableDevice()); await vi.waitFor(() => expect(navigator.permissions.query).toHaveBeenCalledOnce());
    await replace(kind); completeSuccessors = true; permission.resolve({state: 'prompt'} as PermissionStatus);
    expect((await pending).error).toMatchObject({name: 'AbortError'});
    expect(requestSubscription).not.toHaveBeenCalled(); expect(requests).toEqual([]);
  });
  it.each(['song-league', 'new-song', 'stats'] as const)('does not continue legacy %s preference enabling after device registration changes identity', async category => {
    const action = category === 'song-league' ? () => service.setSongLeagueEnabled(true)
      : category === 'new-song' ? () => service.setSongLeagueSongAddedEnabled(true) : () => service.setStatsAccessRequestsEnabled(true);
    const pending = outcome(action()); const registration = await request('upsert_push_subscription');
    actor = 'actor-b'; cloud = 'cloud-b'; completeSuccessors = true; registration.complete(null);
    expect((await pending).error).toMatchObject({name: 'AbortError'});
    expect(requests.map(item => item.name)).toEqual(['upsert_push_subscription']);
  });
  it('rejects signed-out actions before opening a prompt or initializing a client', async () => {
    actor = null;
    for (const action of [() => service.loadSettings(), () => service.enableDevice(),
      () => service.setCategoryPreference('stats_access_requests', true), () => service.setSongLeagueEnabled(false)]) {
      expect((await outcome(action())).error).toMatchObject({name: 'AbortError'});
    }
    expect(requests).toEqual([]); expect(requestSubscription).not.toHaveBeenCalled();
  });
  it.each(['actor', 'cloud'] as const)('does not read replacement %s preferences after the old write has completed', async kind => {
    const pending = outcome(service.setCategoryPreference('song_league', false));
    const write = await request('set_notification_preference'); await replace(kind); completeSuccessors = true; write.complete(null);
    const result = await pending;
    expect(result.error).toMatchObject({name: 'AbortError'});
    expect(requests.map(item => item.name)).toEqual(['set_notification_preference']);
    expect(write).toMatchObject({actor: 'actor-a', cloud: 'cloud-a', body: {p_category: 'song_league', p_enabled: false}});
  });
  it('aborts an in-flight preference write before logout drains and permits a new session read', async () => {
    const pending = outcome(service.setCategoryPreference('stats_access_requests', true));
    const write = await request('set_notification_preference');
    const draining = lifecycle.invalidateAndDrain(); const aborted = write.aborted;
    // Release the baseline request too so the reproduction fails instead of hanging.
    completeSuccessors = true; write.complete(null); const result = await pending; await draining;
    expect(aborted).toBe(true); expect(result.error).toMatchObject({name: 'AbortError'});
    expect(requests).toHaveLength(1);
    actor = 'actor-b'; cloud = 'cloud-b';
    const recovery = service.loadSettings(); const read = await request('get_notification_settings');
    read.complete(settings); expect((await recovery).songLeagueEnabled).toBe(true);
    expect(read).toMatchObject({actor: 'actor-b', cloud: 'cloud-b'});
  });
});
