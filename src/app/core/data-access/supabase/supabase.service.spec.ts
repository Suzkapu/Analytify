import {describe, expect, it, vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {SupabaseService} from './supabase.service';

vi.mock('@supabase/supabase-js', () => ({createClient: vi.fn()}));

describe('SupabaseService client readiness boundary', () => {
  it('returns the same configured client without changing session persistence or OAuth exchange settings', async () => {
    const client = {auth: {}} as any;
    vi.mocked(createClient).mockReturnValue(client);
    const service = new SupabaseService();
    expect(await service.getClient()).toBe(client);
    expect(await service.getClient()).toBe(service.client);
    expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      auth: {flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true}
    });
  });

  it('waits for readiness before reading the collaboration session', async () => {
    const client = {
      auth: {getSession: vi.fn().mockResolvedValue({data: {session: {access_token: 'token', user: {id: 'user'}}}, error: null})},
      realtime: {setAuth: vi.fn().mockResolvedValue(undefined)}
    } as any;
    vi.mocked(createClient).mockReturnValue(client);
    const service = new SupabaseService();
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
    vi.mocked(createClient).mockReturnValue(client);
    const service = new SupabaseService();
    vi.spyOn(service, 'getClient').mockRejectedValue(new Error('Client unavailable'));
    await expect(service.deleteUserCacheEntries('user', ['cache-key'])).rejects.toThrow('Client unavailable');
    expect(client.from).not.toHaveBeenCalled();
  });
});
