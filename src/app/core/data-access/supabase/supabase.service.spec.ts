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
});
