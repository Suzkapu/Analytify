import {BehaviorSubject} from 'rxjs';
import {CompareRoomShellComponent} from './compare-room-shell.component';

describe('CompareRoomShellComponent', () => {
  it('creates a logged-in host room at a mobile viewport width', async () => {
    const coordinator = {
      participants$: new BehaviorSubject<any[]>([]),
      invitations$: new BehaviorSubject<any[]>([]),
      sharedTracks$: new BehaviorSubject<any[]>([]),
      proposal$: new BehaviorSubject<any>(null),
      error$: new BehaviorSubject<string>(''),
      createRoom: jasmine.createSpy('createRoom').and.resolveTo(),
      addInvitation: jasmine.createSpy('addInvitation').and.resolveTo()
    };
    const auth = {
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(true),
      isTokenExpired: jasmine.createSpy('isTokenExpired').and.returnValue(false),
      getAccessToken: jasmine.createSpy('getAccessToken').and.returnValue('host-token'),
      getUserId: jasmine.createSpy('getUserId').and.returnValue('host-user')
    };
    const source = {
      loadMainPlaylists: jasmine.createSpy('loadMainPlaylists').and.resolveTo([])
    };
    const spotify = {
      getProfile: jasmine.createSpy('getProfile').and.resolveTo({
        id: 'host-user',
        display_name: 'Mobile host',
        images: []
      })
    };
    const router = {navigate: jasmine.createSpy('navigate').and.resolveTo(true)};
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 390});

    try {
      const component = new CompareRoomShellComponent(
        coordinator as any,
        auth as any,
        source as any,
        spotify as any,
        router as any
      );

      await component.ngOnInit();

      expect(coordinator.createRoom).toHaveBeenCalledWith(jasmine.objectContaining({
        spotifyUserId: 'host-user',
        displayName: 'Mobile host',
        isMainProfile: true
      }));
      expect(source.loadMainPlaylists).toHaveBeenCalledWith('host-token', 'host-user');
      expect(coordinator.addInvitation).toHaveBeenCalledTimes(1);
      expect(component.isStarting).toBeFalse();
    } finally {
      Object.defineProperty(window, 'innerWidth', {configurable: true, value: originalWidth});
    }
  });
});
