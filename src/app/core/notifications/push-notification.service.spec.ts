import {TestBed} from '@angular/core/testing';
import {SwPush} from '@angular/service-worker';
import {of} from 'rxjs';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PushNotificationService} from './push-notification.service';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let rpc: jasmine.Spy;
  let requestSubscription: jasmine.Spy;
  const subscription = {
    endpoint: 'https://push.example/device',
    toJSON: () => ({
      endpoint: 'https://push.example/device',
      keys: {p256dh: 'public-key', auth: 'auth-secret'}
    })
  } as unknown as PushSubscription;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.callFake(async (name: string) => ({
      data: name === 'get_notification_preferences' ? [{song_league_enabled: false}] : null,
      error: null
    }));
    requestSubscription = jasmine.createSpy('requestSubscription').and.resolveTo(subscription);
    TestBed.configureTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: SwPush,
          useValue: {isEnabled: true, subscription: of(null), requestSubscription}
        },
        {provide: SupabaseService, useValue: {client: {rpc}}}
      ]
    });
    service = TestBed.inject(PushNotificationService);
  });

  it('registers the current PWA device before enabling Song League notifications', async () => {
    const settings = await service.setSongLeagueEnabled(true);

    expect(requestSubscription).toHaveBeenCalledWith({serverPublicKey: jasmine.any(String)});
    expect(rpc).toHaveBeenCalledWith('upsert_push_subscription', {
      p_endpoint: 'https://push.example/device',
      p_p256dh: 'public-key',
      p_auth: 'auth-secret',
      p_user_agent: jasmine.any(String)
    });
    expect(rpc).toHaveBeenCalledWith('set_notification_preference', {
      p_category: 'song_league', p_enabled: true
    });
    expect(settings.songLeagueEnabled).toBeTrue();
    expect(settings.deviceSubscribed).toBeTrue();
  });

  it('turns off Song League delivery without deleting the device subscription needed by future categories', async () => {
    const settings = await service.setSongLeagueEnabled(false);

    expect(requestSubscription).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnceWith('set_notification_preference', {
      p_category: 'song_league', p_enabled: false
    });
    expect(settings.songLeagueEnabled).toBeFalse();
  });
});
