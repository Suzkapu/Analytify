import {TestBed} from '@angular/core/testing';
import {convertToParamMap} from '@angular/router';
import {of} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SharedPlaylistsComponent} from '@features/shared-playlists/shared-playlists.component';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}

function setup() {
  const lifecycle = new SessionLifecycleService();
  const registrations: Array<{name: string; emit: () => void; channel: object}> = [];
  const channel = vi.fn((name: string) => {
    const registration = {name, emit: () => {}, channel: {} as object};
    const value = {
      on: vi.fn((event: string, filter: object, callback: () => void) => {
        expect(event).toBe('postgres_changes');
        expect(filter).toEqual({event: '*', schema: 'public', table: 'stats_access_requests'});
        registration.emit = callback;
        return value;
      }),
      subscribe: vi.fn(() => value)
    };
    registration.channel = value;
    registrations.push(registration);
    return value;
  });
  const removeChannel = vi.fn(async (_channel: object) => 'ok');
  const rpc = vi.fn((name: string) => {
    expect(['list_stats_access_requests', 'list_my_moderation_cases']).toContain(name);
    const result = Promise.resolve({data: [], error: null});
    return Object.assign(result, {abortSignal: (signal: AbortSignal) => signal.aborted ? Promise.reject(signal.reason) : result});
  });
  const client = {channel, removeChannel, rpc};
  const getClient = vi.fn(async () => client);
  TestBed.configureTestingModule({providers: [StatsSharingService,
    {provide: SupabaseService, useValue: {getClient}},
    {provide: SessionLifecycleService, useValue: lifecycle}
  ]});
  return {service: TestBed.inject(StatsSharingService), lifecycle, client, getClient, channel, removeChannel, registrations};
}

function caller(service: StatsSharingService) {
  const sharing = {listReceivedShares: vi.fn(async () => []), listOwnedShares: vi.fn(async () => []), subscribeToShareChanges: vi.fn(() => () => {})};
  const component = new SharedPlaylistsComponent(sharing as never, {} as never, {} as never,
    service, {start: vi.fn()} as never, {} as never,
    {queryParamMap: of(convertToParamMap({tab: 'stats'}))} as never);
  return {component, sharing};
}

afterEach(() => vi.restoreAllMocks());

describe('Stats Realtime public session ownership', () => {
  it('does not register an old session subscription after delayed client readiness', async () => {
    const h = setup();
    const ready = deferred<typeof h.client>();
    h.getClient.mockReturnValue(ready.promise);
    const result = h.service.subscribeToAccessChanges(vi.fn()).then(
      cleanup => ({cleanup, error: undefined}), error => ({cleanup: undefined, error})
    );
    await h.lifecycle.invalidateAndDrain();
    ready.resolve(h.client);
    const outcome = await result;
    outcome.cleanup?.();
    expect(h.channel).not.toHaveBeenCalled();
    expect(outcome.error).toBeInstanceOf(Error);
  });

  it('removes the active channel and suppresses queued callbacks when the session ends', async () => {
    const h = setup();
    const onChange = vi.fn();
    const cleanup = await h.service.subscribeToAccessChanges(onChange);
    h.registrations[0].emit();
    expect(onChange).toHaveBeenCalledTimes(1);
    await h.lifecycle.invalidateAndDrain();
    h.registrations[0].emit();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(h.removeChannel).toHaveBeenCalledExactlyOnceWith(h.registrations[0].channel);
    cleanup();
    cleanup();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('keeps the next account channel alive when the old caller later disposes its subscription', async () => {
    const h = setup();
    const oldChange = vi.fn();
    const currentChange = vi.fn();
    const oldCleanup = await h.service.subscribeToAccessChanges(oldChange);
    await h.lifecycle.invalidateAndDrain();
    const currentCleanup = await h.service.subscribeToAccessChanges(currentChange);
    oldCleanup();
    oldCleanup();
    h.registrations[0].emit();
    h.registrations[1].emit();
    expect(oldChange).not.toHaveBeenCalled();
    expect(currentChange).toHaveBeenCalledTimes(1);
    expect(h.removeChannel.mock.calls.map(([value]) => value)).toEqual([h.registrations[0].channel]);
    currentCleanup();
    expect(h.removeChannel.mock.calls.map(([value]) => value)).toEqual(h.registrations.map(value => value.channel));
    expect(new Set(h.registrations.map(value => value.name)).size).toBe(2);
  });

  it('does not reload the retained sharing caller from an old session event while the page is still mounted', async () => {
    const h = setup();
    const {component, sharing} = caller(h.service);
    expect(component.restrictedFeaturesEnabled).toBe(true);
    await component.ngOnInit();
    const before = sharing.listReceivedShares.mock.calls.length;
    await h.lifecycle.invalidateAndDrain();
    h.registrations[0].emit();
    expect(sharing.listReceivedShares).toHaveBeenCalledTimes(before);
    component.ngOnDestroy();
    expect(h.removeChannel).toHaveBeenCalledExactlyOnceWith(h.registrations[0].channel);
  });

  it('recovers the retained caller in the next generation without allowing old page cleanup to close its channel', async () => {
    const h = setup();
    const old = caller(h.service);
    await old.component.ngOnInit();
    await h.lifecycle.invalidateAndDrain();
    const current = caller(h.service);
    await current.component.ngOnInit();
    old.component.ngOnDestroy();
    h.registrations[0].emit();
    h.registrations[1].emit();
    expect(old.sharing.listReceivedShares).toHaveBeenCalledTimes(1);
    expect(current.sharing.listReceivedShares).toHaveBeenCalledTimes(2);
    expect(h.removeChannel.mock.calls.map(([value]) => value)).toEqual([h.registrations[0].channel]);
    current.component.ngOnDestroy();
    expect(h.removeChannel.mock.calls.map(([value]) => value)).toEqual(h.registrations.map(value => value.channel));
  });

  it('keeps a failed asynchronous removal locally disposed and reports the cleanup failure', async () => {
    const h = setup();
    const failure = new Error('Synthetic removal failed');
    h.removeChannel.mockRejectedValueOnce(failure);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = vi.fn();
    const cleanup = await h.service.subscribeToAccessChanges(onChange);
    cleanup();
    h.registrations[0].emit();
    await vi.waitFor(() => expect(warning).toHaveBeenCalled());
    cleanup();
    await h.lifecycle.invalidateAndDrain();
    expect(onChange).not.toHaveBeenCalled();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('preserves caller disposal if registration finishes after component destruction', async () => {
    const h = setup();
    const ready = deferred<typeof h.client>();
    h.getClient.mockResolvedValueOnce(h.client).mockResolvedValueOnce(h.client).mockReturnValueOnce(ready.promise);
    const {component, sharing} = caller(h.service);
    const initialized = component.ngOnInit();
    await vi.waitFor(() => expect(h.getClient).toHaveBeenCalledTimes(3));
    component.ngOnDestroy();
    ready.resolve(h.client);
    await initialized;
    expect(h.removeChannel).toHaveBeenCalledExactlyOnceWith(h.registrations[0].channel);
    const before = sharing.listReceivedShares.mock.calls.length;
    h.registrations[0].emit();
    expect(sharing.listReceivedShares).toHaveBeenCalledTimes(before);
    component.ngOnDestroy();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });
});
