import {of} from 'rxjs';
import {ListeningHistoryComponent} from './listening-history.component';

describe('ListeningHistoryComponent', () => {
  let storage: Map<string, string>;
  let spotify: {getRecentlyPlayed: jasmine.Spy};
  let component: ListeningHistoryComponent;

  beforeEach(() => {
    storage = new Map<string, string>();
    spotify = {getRecentlyPlayed: jasmine.createSpy('getRecentlyPlayed').and.returnValue(of({items: []}))};
    component = new ListeningHistoryComponent(
      spotify as any,
      {
        getUserId: () => 'user',
        getSupabaseUserId: () => null,
        isBackupActive: () => false
      } as any,
      {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      } as any,
      null as any
    );
  });

  it('uses the newest cached play as the Spotify after cursor', async () => {
    const playedAt = '2026-08-08T10:00:00.000Z';
    storage.set('user_recently_played', JSON.stringify([{played_at: playedAt, track: {id: 'track'}}]));

    await component.loadRecentlyPlayed();

    expect(spotify.getRecentlyPlayed).toHaveBeenCalledOnceWith(50, new Date(playedAt).getTime());
  });

  it('skips Spotify when history was checked in the last five minutes', async () => {
    storage.set('user_recently_played', JSON.stringify([{
      played_at: '2026-08-08T10:00:00.000Z',
      track: {id: 'track'}
    }]));
    storage.set('user_recently_played_lastChecked', Date.now().toString());

    await component.loadRecentlyPlayed();

    expect(spotify.getRecentlyPlayed).not.toHaveBeenCalled();
  });
});
