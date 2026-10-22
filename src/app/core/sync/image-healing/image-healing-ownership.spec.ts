import {afterEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {of, Subject} from 'rxjs';
import {ImageHealingService} from './image-healing.service';

function boundary() {
  let owner = 'account-a';
  let spotifyId = 'spotify-a';
  let exiting = false;
  const writes: Array<{owner: string; key: string; value: string}> = [];
  const uploads: Array<{owner: string; rows: any[]}> = [];
  const spotify = {getArtistsByIds: vi.fn(() => of({artists: [] as any[]})), getTracksByIds: vi.fn(() => of({tracks: [] as any[]}))};
  const cloud = {loadArtistsByIds: vi.fn(async (_ids: string[]) => [] as any[]), syncArtists: vi.fn(async (rows: any[]) => {uploads.push({owner, rows});}), syncTracks: vi.fn(async (rows: any[]) => {uploads.push({owner, rows});})};
  TestBed.configureTestingModule({providers: [ImageHealingService, SessionLifecycleService,
    {provide: SpotifyDataService, useValue: spotify}, {provide: SpotifyAuthService, useValue: {getUserId: () => spotifyId, sessionExiting: () => exiting, getSupabaseUserId: () => owner, isBackupActive: () => true}},
    {provide: StorageService, useValue: {setItem: (key: string, value: string) => writes.push({owner, key, value})}}, {provide: SupabaseService, useValue: cloud}]});
  const service = TestBed.inject(ImageHealingService);
  return {service, lifecycle: TestBed.inject(SessionLifecycleService), spotify, cloud, writes, uploads, replaceOwner: () => {owner = 'account-b';}, replaceSpotify: () => {spotifyId = 'spotify-b';}, exiting: (value: boolean) => {exiting = value;}};
}
async function settled() {for (let i = 0; i < 12; i++) await Promise.resolve();}

afterEach(() => TestBed.resetTestingModule());

describe('Image recovery ownership regressions', () => {
  it('does not persist an old account artist response into the replacement account', async () => {
    const h = boundary();
    let finish!: (rows: any[]) => void;
    h.cloud.loadArtistsByIds.mockReturnValue(new Promise(done => {finish = done;}));
    const rows: any[] = [{id: 'artist-a', images: []}];
    h.service.healArtistImages(rows, 'visible-artists');
    await h.lifecycle.invalidateAndDrain();
    h.replaceOwner();
    finish([{id: 'artist-a', images: [{url: 'https://fixture/old-account-image'}]}]);
    await settled();
    expect(h.writes).toEqual([]);
    expect(rows[0].images).toEqual([]);
    expect(h.uploads).toEqual([]);
  });

  it('does not upload or publish an old account track response after account replacement', async () => {
    const h = boundary();
    const request = new Subject<any>();
    h.spotify.getTracksByIds.mockReturnValue(request);
    const rows: any[] = [{id: 'track-a', album: {images: []}}];
    h.service.healTrackImages(rows, 'visible-tracks');
    await h.lifecycle.invalidateAndDrain();
    h.replaceOwner();
    request.next({tracks: [{id: 'track-a', album: {images: [{url: 'https://fixture/old-account-image'}]}}]});
    request.complete();
    await settled();
    expect(h.uploads).toEqual([]);
    expect(h.writes).toEqual([]);
    expect(rows[0].album.images).toEqual([]);
  });


  it('rejects an old artist response after logout and login to the same account', async () => {
    const h = boundary();
    let finish!: (rows: any[]) => void;
    h.cloud.loadArtistsByIds.mockReturnValue(new Promise(done => {finish = done;}));
    const rows: any[] = [{id: 'artist-a', images: []}];
    h.service.healArtistImages(rows, 'visible-artists');
    await h.lifecycle.invalidateAndDrain();
    finish([{id: 'artist-a', images: [{url: 'https://fixture/expired-session-image'}]}]);
    await settled();
    expect(h.writes).toEqual([]);
    expect(rows[0].images).toEqual([]);
  });

  it('releases an unresolved old track request when the session ends', async () => {
    const h = boundary();
    const request = new Subject<any>();
    h.spotify.getTracksByIds.mockReturnValue(request);
    h.service.healTrackImages([{id: 'track-a'}], 'visible-tracks');
    expect(request.observed).toBe(true);
    await h.lifecycle.invalidateAndDrain();
    expect(request.observed).toBe(false);
  });

  it('starts no recovery work while logout is draining and allows work afterward', async () => {
    const h = boundary();
    h.exiting(true);
    h.service.healArtistImages([{id: 'a'}]);
    h.service.healTrackImages([{id: 't'}]);
    h.service.markArtistImageFailed('a', 'https://fixture/broken');
    expect(h.cloud.loadArtistsByIds).not.toHaveBeenCalled();
    expect(h.spotify.getTracksByIds).not.toHaveBeenCalled();
    h.exiting(false);
    h.service.healArtistImages([{id: 'a'}]);
    await settled();
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(1);
  });

  for (const identity of ['cloud', 'spotify'] as const) {
    it(`rejects pending track data when the ${identity} identity changes before lifecycle notification`, () => {
      const h = boundary();
      const request = new Subject<any>();
      h.spotify.getTracksByIds.mockReturnValue(request);
      const rows: any[] = [{id: 'track-a'}];
      h.service.healTrackImages(rows, 'tracks');
      if (identity === 'cloud') h.replaceOwner(); else h.replaceSpotify();
      request.next({tracks: [{id: 'track-a', album: {images: [{url: 'https://fixture/stale'}]}}]});
      request.complete();
      expect(rows[0].albumCover).toBeUndefined();
      expect(h.writes).toEqual([]);
      expect(h.uploads).toEqual([]);
      h.service.healArtistImages([{id: 'a'}]);
      expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(1);
    });
  }

  it('cancels a pending Spotify artist lookup and permits a new-generation lookup', async () => {
    const h = boundary();
    const oldRequest = new Subject<any>();
    h.spotify.getArtistsByIds.mockReturnValueOnce(oldRequest);
    const oldRows: any[] = [{id: 'a'}];
    h.service.healArtistImages(oldRows, 'artists');
    await settled();
    expect(oldRequest.observed).toBe(true);
    await h.lifecycle.invalidateAndDrain();
    expect(oldRequest.observed).toBe(false);
    h.spotify.getArtistsByIds.mockReturnValueOnce(of({artists: [{id: 'a', images: [{url: 'https://fixture/new'}]}]}));
    const newRows: any[] = [{id: 'a'}];
    h.service.healArtistImages(newRows, 'artists');
    await settled();
    expect(oldRows[0].images).toBeUndefined();
    expect(newRows[0].images[0].url).toBe('https://fixture/new');
  });

  it('discards an artist response when account identity changes during Spotify lookup', async () => {
    const h = boundary();
    const request = new Subject<any>();
    h.spotify.getArtistsByIds.mockReturnValue(request);
    const rows: any[] = [{id: 'a'}];
    h.service.healArtistImages(rows, 'artists');
    await settled();
    h.replaceSpotify();
    request.next({artists: [{id: 'a', images: [{url: 'https://fixture/stale'}]}]});
    request.complete();
    await settled();
    expect(rows[0].images).toBeUndefined();
    expect(h.writes).toEqual([]);
    expect(h.uploads).toEqual([]);
  });

  it('does not let old completion remove a replacement generation in-flight artist deduplication', async () => {
    const h = boundary();
    let finishOld!: (rows: any[]) => void;
    let finishNew!: (rows: any[]) => void;
    h.cloud.loadArtistsByIds.mockReturnValueOnce(new Promise(done => {finishOld = done;}));
    h.cloud.loadArtistsByIds.mockReturnValueOnce(new Promise(done => {finishNew = done;}));
    h.service.healArtistImages([{id: 'a'}]);
    await h.lifecycle.invalidateAndDrain();
    h.service.healArtistImages([{id: 'a'}]);
    finishOld([]);
    await settled();
    h.service.markArtistImageFailed('a', 'https://fixture/old-broken');
    h.service.healArtistImages([{id: 'a'}]);
    expect(h.cloud.loadArtistsByIds).toHaveBeenCalledTimes(2);
    finishNew([{id: 'a', images: [{url: 'https://fixture/new'}]}]);
    await settled();
  });

  it('forgets failed URL suppression after session replacement', async () => {
    const h = boundary();
    h.service.markArtistImageFailed('a', 'https://fixture/recovered');
    await h.lifecycle.invalidateAndDrain();
    h.cloud.loadArtistsByIds.mockResolvedValue([{id: 'a', images: [{url: 'https://fixture/recovered'}]}]);
    const rows: any[] = [{id: 'a'}];
    h.service.healArtistImages(rows);
    await settled();
    expect(rows[0].images[0].url).toBe('https://fixture/recovered');
  });

  it('repairs valid tracks when a partially populated cache also contains a null row', () => {
    const h = boundary();
    h.spotify.getTracksByIds.mockReturnValue(of({tracks: [{id: 'track-a', album: {images: [{url: 'https://fixture/recovered'}]}}]}));
    const rows: any[] = [null, {id: 'track-a', album: {images: []}}];
    h.service.healTrackImages(rows, 'visible-tracks');
    expect(rows[1].album.images).toEqual([{url: 'https://fixture/recovered'}]);
    expect(JSON.parse(h.writes[0].value)).toEqual(rows);
  });

  it('repairs a valid artist when a partially populated cache also contains a null row', async () => {
    const h = boundary();
    h.cloud.loadArtistsByIds.mockResolvedValue([{id: 'artist-a', images: [{url: 'https://fixture/recovered'}]}]);
    const rows: any[] = [null, {id: 'artist-a', images: []}];
    h.service.healArtistImages(rows, 'visible-artists');
    await settled();
    expect(rows[1].images).toEqual([{url: 'https://fixture/recovered'}]);
    expect(JSON.parse(h.writes[0].value)).toEqual(rows);
  });
});
