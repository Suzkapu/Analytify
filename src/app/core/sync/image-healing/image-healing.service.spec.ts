import {afterEach, describe, expect, it, vi} from 'vitest';
import {of, Subject, throwError} from 'rxjs';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {ImageHealingService} from './image-healing.service';

const placeholder = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
const artist = (id: string, url?: string) => ({id, images: url ? [{url}] : []});
const track = (id: string, url?: string): any => ({id, albumCover: url, album: {images: url ? [{url}] : []}});
function harness() {
  const local = new Map<string, string>();
  let owner: string | null = 'owner-a';
  let backup = true;
  const spotify = {getArtistsByIds: vi.fn(() => of({artists: [] as any[]})), getTracksByIds: vi.fn(() => of({tracks: [] as any[]}))};
  const cloud = {loadArtistsByIds: vi.fn(async (_ids: string[]) => [] as any[]), syncArtists: vi.fn(async (_rows: any[]) => {}), syncTracks: vi.fn(async (_rows: any[]) => {})};
  const storage = {setItem: vi.fn((key: string, value: string) => local.set(key, value))};
  const auth = {getUserId: () => 'spotify-a', sessionExiting: () => false, getSupabaseUserId: () => owner, isBackupActive: () => backup};
  return {service: new ImageHealingService(spotify as never, auth as never, storage as never, cloud as never, new SessionLifecycleService()), spotify, cloud, storage, local,
    owner: (value: string | null) => {owner = value;}, backup: (value: boolean) => {backup = value;}};
}
async function settled() {for (let i = 0; i < 12; i++) await Promise.resolve();}
afterEach(() => vi.restoreAllMocks());

describe('Image recovery source and persistence boundaries', () => {
  it('leaves invalid, empty and already complete collections untouched', async () => {
    const h = harness();
    for (const rows of [null, undefined, {}, []]) {
      h.service.healArtistImages(rows as any);
      h.service.healTrackImages(rows as any);
    }
    h.service.healArtistImages([null, {}, {id: 42}, artist(' '), artist('fav'), artist('ready', 'https://fixture/ready')]);
    h.service.healTrackImages([null, {}, track('ready', 'https://fixture/ready'), {id: 'nested', album: {images: [{url: 'https://fixture/nested'}]}}]);
    await settled();
    expect(h.cloud.loadArtistsByIds).not.toHaveBeenCalled();
    expect(h.spotify.getArtistsByIds).not.toHaveBeenCalled();
    expect(h.spotify.getTracksByIds).not.toHaveBeenCalled();
    expect(h.local.size).toBe(0);
  });

  it('repairs duplicate visible artists from normalized metadata before Spotify and persists usable links', async () => {
    const h = harness();
    const rows = [artist('a'), artist('a', placeholder), artist('b', 'https://fixture/existing')];
    h.cloud.loadArtistsByIds.mockResolvedValue([{id: 'a', images: [{url: 'https://fixture/a'}], external_urls: {spotify: 'https://open.spotify.com/artist/a'}}]);
    h.service.healArtistImages(rows, 'artists');
    await settled();
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledWith(['a']);
    expect(rows.slice(0, 2).map(row => row.images[0].url)).toEqual(['https://fixture/a', 'https://fixture/a']);
    expect(JSON.parse(h.local.get('artists')!)).toEqual(rows);
    expect((rows[0] as any).external_urls.spotify).toBe('https://open.spotify.com/artist/a');
    expect(h.spotify.getArtistsByIds).not.toHaveBeenCalled();
    expect(h.cloud.syncArtists).not.toHaveBeenCalled();
  });

  it('fetches only unresolved artists, preserves existing links when a profile has none, and stores recovered Spotify metadata', async () => {
    const h = harness();
    const rows: any[] = [artist('a'), {...artist('b'), external_urls: {spotify: 'https://open.spotify.com/artist/b'}}];
    h.cloud.loadArtistsByIds.mockResolvedValue([artist('a', 'https://fixture/a'), null, {}]);
    h.spotify.getArtistsByIds.mockReturnValue(of({artists: [artist('b', 'https://fixture/b')]}));
    h.service.healArtistImages(rows, 'artists');
    await settled();
    expect(h.spotify.getArtistsByIds).toHaveBeenCalledWith(['b']);
    expect(rows[1].external_urls.spotify).toBe('https://open.spotify.com/artist/b');
    expect(JSON.parse(h.local.get('artists')!)[1].images[0].url).toBe('https://fixture/b');
    expect(h.cloud.syncArtists).toHaveBeenCalledWith([artist('b', 'https://fixture/b')]);
  });

  it('coalesces concurrent artist requests and does not repeatedly retry an exhausted artist', async () => {
    const h = harness();
    let resolve!: (value: any[]) => void;
    h.cloud.loadArtistsByIds.mockReturnValue(new Promise(done => {resolve = done;}));
    const rows = [artist('a')];
    h.service.healArtistImages(rows);
    h.service.healArtistImages(rows);
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(1);
    resolve([]);
    await settled();
    h.service.healArtistImages(rows);
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(1);
    expect(h.local.size).toBe(0);
  });

  it('rejects known broken cloud and Spotify URLs and allows a marked artist one fresh attempt', async () => {
    const h = harness();
    const rows = [artist('a')];
    h.service.healArtistImages(rows);
    await settled();
    for (const [id, url] of [['', 'x'], ['a', ''], ['a', placeholder], ['a', null]]) h.service.markArtistImageFailed(id!, url);
    h.service.healArtistImages(rows);
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(1);
    h.service.markArtistImageFailed('a', 'https://fixture/broken');
    h.cloud.loadArtistsByIds.mockResolvedValue([artist('a', 'https://fixture/broken')]);
    h.spotify.getArtistsByIds.mockReturnValue(of({artists: [artist('a', 'https://fixture/broken'), artist('unknown', 'https://fixture/other')]}));
    h.service.healArtistImages(rows, 'artists');
    await settled();
    expect(rows[0].images).toEqual([]);
    expect(h.local.size).toBe(0);
    h.service.markArtistImageFailed('a', 'https://fixture/broken-2');
    h.spotify.getArtistsByIds.mockReturnValue(of({artists: [artist('a', 'https://fixture/fresh')]}));
    h.service.healArtistImages(rows);
    await settled();
    expect(rows[0].images[0].url).toBe('https://fixture/fresh');
  });

  it('splits 101 unresolved artist lookups at the Spotify 50-ID boundary', async () => {
    const h = harness();
    const rows = Array.from({length: 101}, (_, i) => artist(`a-${i}`));
    h.spotify.getArtistsByIds.mockImplementation((...args: any[]) => of({artists: args[0].map((id: string) => artist(id, `https://fixture/${id}`))}));
    h.service.healArtistImages(rows, 'artists');
    await settled();
    expect(h.spotify.getArtistsByIds.mock.calls.map(call => (call as any)[0].length)).toEqual([50, 50, 1]);
    expect(rows.every(row => row.images[0]?.url === `https://fixture/${row.id}`)).toBe(true);
    expect(h.cloud.syncArtists.mock.calls[0][0]).toHaveLength(101);
  });

  for (const permission of ['disabled', 'anonymous'] as const) {
    it(`recovers artists locally without cloud writes when backup is ${permission}`, async () => {
      const h = harness();
      if (permission === 'disabled') h.backup(false); else h.owner(null);
      h.spotify.getArtistsByIds.mockReturnValue(of({artists: [artist('a', 'https://fixture/a')]}));
      const rows = [artist('a')];
      h.service.healArtistImages(rows, 'artists');
      await settled();
      expect(JSON.parse(h.local.get('artists')!)[0].images[0].url).toBe('https://fixture/a');
      expect(h.cloud.syncArtists).not.toHaveBeenCalled();
    });
  }

  it('retains cloud repairs when the remaining Spotify request fails', async () => {
    const h = harness();
    h.cloud.loadArtistsByIds.mockResolvedValue([artist('a', 'https://fixture/a')]);
    h.spotify.getArtistsByIds.mockReturnValue(throwError(() => new Error('offline')));
    const rows = [artist('a'), artist('b')];
    h.service.healArtistImages(rows, 'artists');
    await settled();
    expect(JSON.parse(h.local.get('artists')!)).toEqual([artist('a', 'https://fixture/a'), artist('b')]);
    expect(h.cloud.syncArtists).not.toHaveBeenCalled();
  });

  it('contains database rejection and cloud write rejection without corrupting local recovery', async () => {
    const h = harness();
    h.cloud.loadArtistsByIds.mockRejectedValueOnce(new Error('database unavailable'));
    const unavailable = [artist('a')];
    h.service.healArtistImages(unavailable, 'artists');
    await settled();
    expect(unavailable[0].images).toEqual([]);
    expect(h.local.size).toBe(0);
    h.spotify.getArtistsByIds.mockReturnValue(of({artists: [artist('b', 'https://fixture/b')]}));
    h.cloud.syncArtists.mockRejectedValueOnce(new Error('cloud unavailable'));
    h.service.healArtistImages([artist('b')], 'artists');
    await settled();
    expect(JSON.parse(h.local.get('artists')!)[0].images[0].url).toBe('https://fixture/b');
  });

  it('treats omitted Spotify artist collections as no recovery', async () => {
    const h = harness();
    h.spotify.getArtistsByIds.mockReturnValue(of({} as any));
    h.service.healArtistImages([artist('a')]);
    await settled();
    expect(h.cloud.syncArtists).not.toHaveBeenCalled();
    expect(h.local.size).toBe(0);
  });

  it('repairs missing flattened and nested track covers without erasing unrelated album metadata', () => {
    const h = harness();
    const rows = [track('a', placeholder), {id: 'b', album: {name: 'Album B'}}, {id: 'c'}] as any[];
    const full = ['a', 'b', 'c'].map(id => ({id, album: {images: [{url: `https://fixture/${id}`}]}}));
    h.spotify.getTracksByIds.mockReturnValue(of({tracks: [null, ...full]}));
    h.service.healTrackImages(rows, 'tracks');
    expect(rows.map(row => row.albumCover)).toEqual(['https://fixture/a', 'https://fixture/b', 'https://fixture/c']);
    expect(rows[1].album.name).toBe('Album B');
    expect(rows.every(row => row.album.images[0].url === row.albumCover)).toBe(true);
    expect(JSON.parse(h.local.get('tracks')!)).toEqual(rows);
    expect(h.cloud.syncTracks).toHaveBeenCalledWith(full);
  });

  it('splits track requests into 50-ID batches and keeps successful batches after another fails', async () => {
    const h = harness();
    const rows = Array.from({length: 51}, (_, i) => track(`t-${i}`));
    h.spotify.getTracksByIds.mockImplementation((...args: any[]) => args[0].length === 1 ? throwError(() => new Error('last batch unavailable')) : of({tracks: args[0].map((id: string) => ({id, album: {images: [{url: `https://fixture/${id}`}]}}))}));
    h.service.healTrackImages(rows, 'tracks');
    await settled();
    expect(h.spotify.getTracksByIds.mock.calls.map(call => (call as any)[0].length)).toEqual([50, 1]);
    expect(JSON.parse(h.local.get('tracks')!).filter((row: any) => !!row.albumCover)).toHaveLength(50);
    expect(rows[50].albumCover).toBeUndefined();
  });

  for (const response of [{}, {tracks: [null]}, {tracks: [{id: 'a'}]}, {tracks: [{id: 'a', album: {images: [{url: placeholder}]}}]}]) {
    it(`does not persist unusable track recovery ${JSON.stringify(response)}`, () => {
      const h = harness();
      h.spotify.getTracksByIds.mockReturnValue(of(response as any));
      const rows = [track('a')];
      h.service.healTrackImages(rows, 'tracks');
      expect(rows[0].albumCover).toBeUndefined();
      expect(h.local.size).toBe(0);
      expect(h.cloud.syncTracks).not.toHaveBeenCalled();
    });
  }

  for (const permission of ['disabled', 'anonymous'] as const) {
    it(`recovers tracks without cloud writes when backup is ${permission}`, () => {
      const h = harness();
      if (permission === 'disabled') h.backup(false); else h.owner(null);
      h.spotify.getTracksByIds.mockReturnValue(of({tracks: [{id: 'a', album: {images: [{url: 'https://fixture/a'}]}}]}));
      const rows = [track('a')];
      h.service.healTrackImages(rows);
      expect(rows[0].albumCover).toBe('https://fixture/a');
      expect(h.storage.setItem).not.toHaveBeenCalled();
      expect(h.cloud.syncTracks).not.toHaveBeenCalled();
    });
  }

  it('keeps locally repaired tracks when cloud backup rejects', async () => {
    const h = harness();
    h.cloud.syncTracks.mockRejectedValueOnce(new Error('backup rejected'));
    h.spotify.getTracksByIds.mockReturnValue(of({tracks: [{id: 'a', album: {images: [{url: 'https://fixture/a'}]}}]}));
    h.service.healTrackImages([track('a')], 'tracks');
    await settled();
    expect(JSON.parse(h.local.get('tracks')!)[0].albumCover).toBe('https://fixture/a');
  });
});
