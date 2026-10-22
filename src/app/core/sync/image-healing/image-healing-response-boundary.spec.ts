import {afterEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {ImageHealingService} from './image-healing.service';

function responseBoundary() {
  const writes = new Map<string, string>();
  const cloud = {syncTracks: vi.fn(async (_rows: any[]) => {})};
  TestBed.configureTestingModule({providers: [
    provideHttpClient(), provideHttpClientTesting(), ImageHealingService, SpotifyDataService, SessionLifecycleService,
    {provide: SpotifyAuthService, useValue: {getUserId: () => 'spotify-fixture', getSupabaseUserId: () => 'cloud-fixture', isBackupActive: () => true, sessionExiting: () => false}},
    {provide: StorageService, useValue: {getItem: () => null, setItem: (key: string, value: string) => writes.set(key, value)}},
    {provide: SupabaseService, useValue: cloud}
  ]});
  return {service: TestBed.inject(ImageHealingService), http: TestBed.inject(HttpTestingController), cloud, writes};
}
const completeTrack = (id: string, image: string) => ({id, albumCover: image, album: {images: [{url: image}]}});
afterEach(() => {vi.useRealTimers(); TestBed.resetTestingModule();});

// These mismatched responses intentionally have no linked_from identity. Stats
// supports explicit relinking elsewhere; image healing currently does not.
describe('Image recovery accepts only requested track identities', () => {
  it('ignores an unsolicited-only aggregate response without replacing a valid cached cover', async () => {
    vi.useFakeTimers();
    const h = responseBoundary();
    const rows: any[] = [{id: 'missing-a', album: {images: []}}, completeTrack('ready-b', 'https://fixture/current-b')];
    const original = structuredClone(rows);
    h.service.healTrackImages(rows, 'tracks');
    await vi.advanceTimersByTimeAsync(0);
    h.http.expectOne(request => request.url.endsWith('/tracks/missing-a')).flush({id: 'ready-b', album: {images: [{url: 'https://fixture/unsolicited-b'}]}});
    h.http.verify();
    expect(rows).toEqual(original);
    expect(h.writes.size).toBe(0);
    expect(h.cloud.syncTracks).not.toHaveBeenCalled();
  });

  it('repairs requested rows from a mixed aggregate while preserving unsolicited valid cached rows', async () => {
    vi.useFakeTimers();
    const h = responseBoundary();
    const rows: any[] = [{id: 'missing-a', album: {images: []}}, {id: 'missing-c', album: {images: []}}, completeTrack('ready-b', 'https://fixture/current-b')];
    const accepted = {id: 'missing-a', album: {images: [{url: 'https://fixture/recovered-a'}]}};
    h.service.healTrackImages(rows, 'tracks');
    await vi.advanceTimersByTimeAsync(0);
    h.http.expectOne(request => request.url.endsWith('/tracks/missing-a')).flush(accepted);
    h.http.expectOne(request => request.url.endsWith('/tracks/missing-c')).flush({id: 'ready-b', album: {images: [{url: 'https://fixture/unsolicited-b'}]}});
    h.http.verify();
    expect(rows[0]).toEqual(completeTrack('missing-a', 'https://fixture/recovered-a'));
    expect(rows[1]).toEqual({id: 'missing-c', album: {images: []}});
    expect(rows[2]).toEqual(completeTrack('ready-b', 'https://fixture/current-b'));
    expect(JSON.parse(h.writes.get('tracks')!)).toEqual(rows);
    expect(h.cloud.syncTracks).toHaveBeenCalledExactlyOnceWith([accepted]);
  });
});
