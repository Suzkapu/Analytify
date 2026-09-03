import {TestBed} from '@angular/core/testing';

import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {AdminService} from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let rpc: jasmine.Spy;
  let invoke: jasmine.Spy;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', ['getSupabaseUserId']);
    rpc = jasmine.createSpy('rpc').and.resolveTo({data: true, error: null});
    invoke = jasmine.createSpy('invoke').and.resolveTo({data: {ok: true, sent: 1}, error: null});
    TestBed.configureTestingModule({providers: [
      AdminService,
      {provide: SpotifyAuthService, useValue: auth},
      {provide: SupabaseService, useValue: {client: {rpc, functions: {invoke}}}}
    ]});
    service = TestBed.inject(AdminService);
  });

  it('does not query Supabase for a local-only session', async () => {
    auth.getSupabaseUserId.and.returnValue(null);

    expect(await service.isAdmin(true)).toBeFalse();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('checks the trusted RPC when a cloud identity exists', async () => {
    auth.getSupabaseUserId.and.returnValue('supabase-user');

    expect(await service.isAdmin(true)).toBeTrue();
    expect(rpc).toHaveBeenCalledOnceWith('is_app_admin');
  });

  it('sends a test push only through the authenticated notification function', async () => {
    expect(await service.sendTestNotification()).toBe(1);
    expect(invoke).toHaveBeenCalledOnceWith('song-league-notifications', {
      body: {action: 'test'}
    });
  });
});
