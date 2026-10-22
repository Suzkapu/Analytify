import {TestBed} from '@angular/core/testing';
import {createClient} from '@supabase/supabase-js';
import {beforeEach, describe, expect, it, vi, type Mock} from 'vitest';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SongLeagueService} from './song-league.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}

describe('Song League creation session ownership', () => {
  let service: SongLeagueService;
  let lifecycle: SessionLifecycleService;
  let actor: string | null;
  let rpc: Mock<(...args: any[]) => Promise<any>>;
  let getSession: ReturnType<typeof vi.fn>;
  let getUser: ReturnType<typeof vi.fn>;
  let getClient: ReturnType<typeof vi.fn>;
  let client: any;

  beforeEach(() => {
    actor = 'actor-A';
    rpc = vi.fn().mockResolvedValue({data: 'created', error: null});
    getSession = vi.fn(async () => ({data: {session: actor ? {user: {id: actor}} : null}, error: null}));
    getUser = vi.fn(() => {throw new Error('Unexpected remote auth lookup');});
    client = {rpc: (...args: any[]) => {const response = rpc(...args); return Object.assign(response, {abortSignal: () => response});}, auth: {getSession, getUser}};
    getClient = vi.fn().mockResolvedValue(client);
    TestBed.configureTestingModule({providers: [
      SongLeagueService, SessionLifecycleService,
      {provide: SupabaseService, useValue: {getClient}},
      {provide: SpotifyDataService, useValue: {}}
    ]});
    lifecycle = TestBed.inject(SessionLifecycleService);
    service = TestBed.inject(SongLeagueService);
  });

  it('keeps uncertain same-form secrets separate for local SDK actors and retries only the original owner intent', async () => {
    rpc.mockResolvedValueOnce({data: null, error: new Error('Acknowledgement lost')});
    await expect(service.createLeague('Same league', 'UTC')).rejects.toThrow('Acknowledgement lost');
    const first = rpc.mock.calls[0][1]; actor = 'actor-B';
    await service.createLeague('Same league', 'UTC'); const second = rpc.mock.calls[1][1];
    expect(second.p_invite_token).not.toBe(first.p_invite_token);
    expect(second.p_idempotency_key).not.toBe(first.p_idempotency_key);
    actor = 'actor-A'; await service.createLeague('Same league', 'UTC');
    expect(rpc.mock.calls[2][1]).toEqual(first);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('invalidates uncertain intents when the same user logs out and signs in again', async () => {
    rpc.mockResolvedValueOnce({data: null, error: new Error('Acknowledgement lost')});
    await expect(service.createLeague('Same league', 'UTC')).rejects.toThrow('Acknowledgement lost');
    const previous = rpc.mock.calls[0][1]; await lifecycle.invalidateAndDrain();
    await service.createLeague('Same league', 'UTC');
    expect(rpc.mock.calls[1][1].p_invite_token).not.toBe(previous.p_invite_token);
    expect(rpc.mock.calls[1][1].p_idempotency_key).not.toBe(previous.p_idempotency_key);
  });

  it('does not expose an old invitation acknowledgement after the app session ends', async () => {
    const response = deferred<any>(); rpc.mockReturnValueOnce(response.promise);
    const pending = service.createLeague('Same league', 'UTC');
    const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    const draining = lifecycle.invalidateAndDrain(); actor = 'actor-B'; response.resolve({data: 'old-owner-league', error: null});
    await result; await draining;
    await service.createLeague('Same league', 'UTC');
    expect(rpc.mock.calls[1][1].p_invite_token).not.toBe(rpc.mock.calls[0][1].p_invite_token);
  });

  it('rejects an acknowledgement when the local SDK actor changed without an app generation change', async () => {
    const response = deferred<any>(); rpc.mockReturnValueOnce(response.promise);
    const pending = service.createLeague('Same league', 'UTC'); const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce()); actor = 'actor-B'; response.resolve({data: 'old-owner-league', error: null});
    await result; expect(getUser).not.toHaveBeenCalled();
  });

  it('discards an acknowledgement if the local SDK session disappears during the request', async () => {
    const response = deferred<any>(); rpc.mockReturnValueOnce(response.promise);
    const pending = service.createLeague('Same league', 'UTC'); const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce()); actor = null; response.resolve({data: 'old-owner-league', error: null});
    await result;
  });

  it('does not begin a mutation after session cancellation while client readiness is pending', async () => {
    const ready = deferred<any>(); getClient.mockReturnValueOnce(ready.promise);
    const pending = service.createLeague('Same league', 'UTC'); const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    const draining = lifecycle.invalidateAndDrain(); ready.resolve(client); await result; await draining;
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not begin a mutation after cancellation while local session readiness is pending', async () => {
    const session = deferred<any>(); getSession.mockReturnValueOnce(session.promise);
    const pending = service.createLeague('Same league', 'UTC'); const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    const draining = lifecycle.invalidateAndDrain(); session.resolve({data: {session: {user: {id: 'actor-A'}}}, error: null});
    await result; await draining; expect(rpc).not.toHaveBeenCalled();
  });

  it('cancels before mutation when logout is queued at the local readiness handover', async () => {
    getSession.mockImplementationOnce(() => {
      const ready = Promise.resolve({data: {session: {user: {id: 'actor-A'}}}, error: null});
      void ready.then(() => queueMicrotask(() => {void lifecycle.invalidateAndDrain();}));
      return ready;
    });
    await expect(service.createLeague('Same league', 'UTC')).rejects.toMatchObject({name: 'AbortError'});
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not dispatch an old mutation after logout interrupts actual SDK access-token readiness', async () => {
    const tokenStarted = deferred<void>(); const token = deferred<string>();
    const dispatched: string[] = []; let armed = false; let blocked = false;
    const sdk = createClient('https://league-owner.fixture.invalid', 'fixture-public-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      accessToken: async () => {
        if (armed && !blocked) {blocked = true; tokenStarted.resolve(); return token.promise;}
        return 'fixture-token';
      },
      global: {fetch: async (input, init) => {
        // Match native fetch: an aborted request never crosses the transport boundary.
        if (init?.signal?.aborted) throw new DOMException('Request aborted before dispatch.', 'AbortError');
        const url = new URL(String(input)); expect(url.origin).toBe('https://league-owner.fixture.invalid');
        dispatched.push(url.pathname);
        return new Response(JSON.stringify('created'), {headers: {'Content-Type': 'application/json'}});
      }}
    });
    const scoped = new SongLeagueService({getClient: async () => ({rpc: sdk.rpc.bind(sdk), auth: {getSession}})} as any, {} as any, lifecycle);
    armed = true; const pending = scoped.createLeague('Same league', 'UTC'); const result = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await tokenStarted.promise; const draining = lifecycle.invalidateAndDrain(); token.resolve('old-session-token');
    await result; await draining; expect(dispatched).toEqual([]);
  });

  it('rejects a missing local login before generating a usable creation mutation', async () => {
    actor = null; await expect(service.createLeague('Same league', 'UTC')).rejects.toThrow('login is required'); expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves a current-session SDK read error when validating a completed acknowledgement', async () => {
    const error = new Error('Local session storage unavailable');
    getSession.mockResolvedValueOnce({data: {session: {user: {id: 'actor-A'}}}, error: null})
      .mockResolvedValueOnce({data: {session: null}, error});
    await expect(service.createLeague('Same league', 'UTC')).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledOnce();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('preserves local session read errors without sending a mutation', async () => {
    const error = new Error('Local session unavailable'); getSession.mockResolvedValue({data: {session: null}, error});
    await expect(service.createLeague('Same league', 'UTC')).rejects.toBe(error); expect(rpc).not.toHaveBeenCalled();
  });
});
