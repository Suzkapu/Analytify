import {TestBed} from '@angular/core/testing';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
const sdk={createClient:vi.fn()};
vi.doMock('@supabase/supabase-js',()=>({createClient:sdk.createClient}));
let module:typeof import('./supabase.service');
beforeAll(async()=>{module=await import('./supabase.service');});
afterEach(()=>{TestBed.resetTestingModule();vi.clearAllMocks();});
describe('Supabase SDK default factory boundary',()=>{
  it('creates the default client lazily through the dependency token with explicit PKCE/session options',async()=>{
    const client={auth:{fixture:true}};sdk.createClient.mockReturnValue(client);
    const factory=TestBed.inject(module.SUPABASE_CLIENT_FACTORY);
    expect(sdk.createClient).not.toHaveBeenCalled();
    await expect(factory()).resolves.toBe(client);
    expect(sdk.createClient).toHaveBeenCalledExactlyOnceWith(expect.any(String),expect.any(String),{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
  });
  it('propagates SDK creation failure without returning an incomplete client',async()=>{
    const failure=new Error('Isolated SDK creation failure');sdk.createClient.mockImplementationOnce(()=>{throw failure;});
    await expect(module.loadSupabaseClient()).rejects.toBe(failure);
  });
});
