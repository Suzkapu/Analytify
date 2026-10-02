import {describe, expect, it, vi} from 'vitest';
import {loadSupabaseClient, SupabaseService} from './supabase.service';

describe('SupabaseService client readiness boundary', () => {
  it('returns the same configured client without changing session persistence or OAuth exchange settings', async () => {
    const client = {auth: {}} as any;
    const createClient = vi.fn().mockReturnValue(client);
    const service = new SupabaseService(() => loadSupabaseClient(async () => ({createClient}) as any));
    expect(createClient).not.toHaveBeenCalled();
    expect(await service.getClient()).toBe(client);
    expect(await service.getClient()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      auth: {flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true}
    });
  });

  it('waits for readiness before reading the collaboration session', async () => {
    const client = {
      auth: {getSession: vi.fn().mockResolvedValue({data: {session: {access_token: 'token', user: {id: 'user'}}}, error: null})},
      realtime: {setAuth: vi.fn().mockResolvedValue(undefined)}
    } as any;
    const service = new SupabaseService(async () => client);
    let resolveClient!: (value: any) => void;
    vi.spyOn(service, 'getClient').mockReturnValue(new Promise(resolve => { resolveClient = resolve; }));
    const session = service.ensureCollaborationSession();
    expect(client.auth.getSession).not.toHaveBeenCalled();
    resolveClient(client);
    await expect(session).resolves.toBe('user');
    expect(client.realtime.setAuth).toHaveBeenCalledWith('token');
  });

  it('does not delete cached entries if initialization fails', async () => {
    const client = {from: vi.fn()} as any;
    const service = new SupabaseService(async () => client);
    vi.spyOn(service, 'getClient').mockRejectedValue(new Error('Client unavailable'));
    await expect(service.deleteUserCacheEntries('user', ['cache-key'])).rejects.toThrow('Client unavailable');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('coalesces concurrent initialization and retains the successful client', async () => {
    let resolveClient!: (value: any) => void;
    const factory = vi.fn(() => new Promise<any>(resolve => { resolveClient = resolve; }));
    const service = new SupabaseService(factory);
    expect(factory).not.toHaveBeenCalled();
    const first = service.getClient();
    expect(service.getClient()).toBe(first);
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);
    const client = {};
    resolveClient(client);
    await expect(first).resolves.toBe(client);
    expect(service.getClient()).toBe(first);
  });

  it('retries initialization after a shared failed request', async () => {
    const client = {} as any;
    const factory = vi.fn().mockRejectedValueOnce(new Error('SDK unavailable')).mockResolvedValue(client);
    const service = new SupabaseService(factory);
    const failed = service.getClient();
    expect(service.getClient()).toBe(failed);
    await expect(failed).rejects.toThrow('SDK unavailable');
    await expect(service.getClient()).resolves.toBe(client);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('turns synchronous factory failure into a retryable rejected promise', async () => {
    const factory = vi.fn().mockImplementationOnce(() => { throw new Error('Initialization failed'); });
    factory.mockResolvedValue({});
    const service = new SupabaseService(factory);
    await expect(service.getClient()).rejects.toThrow('Initialization failed');
    await expect(service.getClient()).resolves.toEqual({});
  });
});
