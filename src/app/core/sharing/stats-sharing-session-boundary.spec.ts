import {TestBed} from '@angular/core/testing';
import {createClient} from '@supabase/supabase-js';
import {describe, expect, it, vi} from 'vitest';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from './stats-sharing.service';

describe('Stats Sharing session suspension boundary', () => {
  it.each([
    ['consent answer', (service: StatsSharingService) => service.respondToRequest('old-owner-request', true)],
    ['shared snapshot', (service: StatsSharingService) => service.loadSharedStats('owner', 'short_term')],
    ['request list', (service: StatsSharingService) => service.listAccessRequests()],
    ['discoverability', (service: StatsSharingService) => service.setDiscoverability(true)],
    ['moderation report', (service: StatsSharingService) => service.reportUser('other', 'safety issue')],
    ['moderation notice', (service: StatsSharingService) => service.listModerationCases()],
    ['appeal', (service: StatsSharingService) => service.appealModerationCase('report', 'reconsider')],
    ['share acceptance', (service: StatsSharingService) => service.acceptShareInvite('private-token')]
  ] as const)('does not dispatch an old %s after logout while client readiness is suspended', async (_name, call) => {
    const lifecycle = new SessionLifecycleService();
    let actor = 'old-owner';
    const sent: Array<{authorization: string | null; rpc: string}> = [];
    const client = createClient('https://stats-session.fixture.invalid', 'synthetic-public-key', {
      accessToken: async () => `synthetic-${actor}`,
      global: {fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (init.signal?.aborted) throw new DOMException('Synthetic fetch cancelled.', 'AbortError');
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.origin).toBe('https://stats-session.fixture.invalid');
        sent.push({authorization: new Headers(init.headers).get('Authorization'), rpc: url.pathname});
        return new Response(JSON.stringify('approved'), {headers: {'content-type': 'application/json'}});
      }) as typeof fetch}
    });
    let releaseClient!: (value: typeof client) => void;
    const ready = new Promise<typeof client>(resolve => {releaseClient = resolve;});
    TestBed.configureTestingModule({providers: [StatsSharingService,
      {provide: SupabaseService, useValue: {getClient: () => ready}},
      {provide: SessionLifecycleService, useValue: lifecycle}
    ]});
    const service = TestBed.inject(StatsSharingService);
    const result = call(service).then(
      value => ({value, error: undefined}), error => ({value: undefined, error})
    );
    await lifecycle.invalidateAndDrain();
    actor = 'new-owner';
    releaseClient(client);
    const outcome = await result;
    expect(sent).toEqual([]);
    expect(outcome.error).toBeDefined();
  });

  it('does not dispatch a revoked-session action after the SDK resumes its token lookup', async () => {
    const lifecycle = new SessionLifecycleService();
    let tokenRead!: () => void;
    let releaseToken!: (token: string) => void;
    const entered = new Promise<void>(resolve => {tokenRead = resolve;});
    const token = new Promise<string>(resolve => {releaseToken = resolve;});
    const sent: string[] = [];
    const client = createClient('https://stats-session.fixture.invalid', 'synthetic-public-key', {
      accessToken: async () => {tokenRead(); return token;},
      global: {fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (init.signal?.aborted) throw new DOMException('Synthetic fetch cancelled.', 'AbortError');
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.origin).toBe('https://stats-session.fixture.invalid');
        sent.push(new Headers(init.headers).get('Authorization') || '');
        return new Response(JSON.stringify(true), {headers: {'content-type': 'application/json'}});
      }) as typeof fetch}
    });
    TestBed.configureTestingModule({providers: [StatsSharingService,
      {provide: SupabaseService, useValue: {getClient: async () => client}},
      {provide: SessionLifecycleService, useValue: lifecycle}
    ]});
    const result = TestBed.inject(StatsSharingService).revokeAccess('old-owner-request').then(
      value => ({value, error: undefined}), error => ({value: undefined, error})
    );
    await entered;
    await lifecycle.invalidateAndDrain();
    releaseToken('synthetic-new-owner');
    const outcome = await result;
    expect(sent).toEqual([]);
    expect(outcome.error).toBeDefined();
  });

  it('rejects a private snapshot if logout happens after the response arrives but before decoding finishes', async () => {
    const lifecycle = new SessionLifecycleService();
    let decoding!: () => void;
    let releaseBody!: (body: string) => void;
    const entered = new Promise<void>(resolve => {decoding = resolve;});
    const body = new Promise<string>(resolve => {releaseBody = resolve;});
    const client = createClient('https://stats-session.fixture.invalid', 'synthetic-public-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {fetch: (async () => {
        const response = new Response('', {headers: {'content-type': 'application/json'}});
        vi.spyOn(response, 'text').mockImplementation(() => {decoding(); return body;});
        return response;
      }) as typeof fetch}
    });
    TestBed.configureTestingModule({providers: [StatsSharingService,
      {provide: SupabaseService, useValue: {getClient: async () => client}},
      {provide: SessionLifecycleService, useValue: lifecycle}
    ]});
    const result = TestBed.inject(StatsSharingService).loadSharedStats('owner', 'short_term').then(
      value => ({value, error: undefined}), error => ({value: undefined, error})
    );
    await entered;
    await lifecycle.invalidateAndDrain();
    releaseBody(JSON.stringify({ownerUserId: 'owner', snapshotDate: 'private', topTracks: [{id: 'private-track'}], topArtists: [], topGenres: []}));
    const outcome = await result;
    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(Error);
  });
});
