import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {StorageService} from '@core/data-access/storage/storage.service';
import {environment} from '@env/environment';
import {ParticipantSpotifyService} from './participant-spotify.service';

let service: ParticipantSpotifyService;
let http: HttpTestingController;
let disk: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  disk = new Map();
  TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(), ParticipantSpotifyService,
    {provide: StorageService, useValue: {getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => disk.set(key, value)}}]});
  service = TestBed.inject(ParticipantSpotifyService);
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {http.verify(); vi.useRealTimers(); TestBed.resetTestingModule();});
const discovery = `${environment.spotifyUrl}/me/playlists?limit=50&offset=0`;

describe('Participant save cancellation boundaries', () => {
  it('does not start profile requests for an already cancelled save', async () => {
    const controller = new AbortController();
    controller.abort();
    const pending = service.createPlaylist('expired-fixture-token', 'Name', '', [], {signal: controller.signal});
    const unexpected = http.match(`${environment.spotifyUrl}/me`);
    // Resolve any erroneous request so this RED does not leave live work behind.
    unexpected.forEach(r => r.flush({}));
    expect(await pending).toMatchObject({success: false, addedTracks: 0});
    expect(unexpected).toHaveLength(0);
    expect(disk.size).toBe(0);
  });

  it('cancels pending recovery discovery and cannot persist a late match after cancellation', async () => {
    const operation = {accountId: 'fixture-owner', operationId: 'proposal', fingerprint: 'content'};
    const first = service.createPlaylist('fixture-token', 'Name', '', [], operation);
    http.expectOne(discovery).flush({items: [], total: 0});
    await vi.advanceTimersByTimeAsync(0);
    const create = http.expectOne(`${environment.spotifyUrl}/me/playlists`);
    const marker = create.request.body.description;
    create.flush({}, {status: 504, statusText: 'Lost response'});
    expect(await first).toMatchObject({success: false});
    expect(disk.size).toBe(0);

    const controller = new AbortController();
    const pending = service.createPlaylist('fixture-token', 'Name', '', [], {...operation, signal: controller.signal});
    const read = http.expectOne(discovery);
    controller.abort();
    const cancelledAtAbort = read.cancelled;
    if (!read.cancelled) read.flush({items: [{id: 'late-playlist', description: marker, owner: {id: 'fixture-owner'}}], total: 1});
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toMatchObject({success: false, addedTracks: 0});
    expect.soft(cancelledAtAbort).toBe(true);
    expect(disk.size).toBe(0);
    http.expectNone(`${environment.spotifyUrl}/playlists/late-playlist/items`);
  });
});


for (const reason of ['Session ended', null]) {
it(`retains acknowledged batch progress when cancellation reason is ${JSON.stringify(reason)}`, async () => {
  const controller = new AbortController();
  const tracks = Array.from({length: 101}, (_, i) => ({id: String(i), uri: `spotify:track:${i}`})) as any;
  const pending = service.syncPlaylist('fixture-token', 'saved', null, 'Name', '', tracks, controller.signal);
  http.expectOne(`${environment.spotifyUrl}/playlists/saved`).flush(null);
  await vi.advanceTimersByTimeAsync(0);
  http.expectOne(`${environment.spotifyUrl}/playlists/saved/items`).flush({});
  controller.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toMatchObject({success: false, addedTracks: 100});
  http.expectNone(`${environment.spotifyUrl}/playlists/saved/items`);
});

}

for (const mode of ['create', 'sync'] as const) {
  it(`keeps acknowledged ${mode} creation recoverable after cancellation before tracks are written`, async () => {
    const operation = {accountId: 'fixture-owner', operationId: 'acknowledged', fingerprint: 'content'};
    const controller = new AbortController();
    const save = (signal?: AbortSignal) => mode === 'create'
      ? service.createPlaylist('fixture-token', 'Name', '', [], {...operation, signal})
      : service.syncPlaylist('fixture-token', null, null, 'Name', '', [], signal, operation);
    const first = save(controller.signal);
    http.expectOne(discovery).flush({items: [], total: 0});
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(`${environment.spotifyUrl}/me/playlists`).flush({id: 'acknowledged-id'});
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toMatchObject({success: false, playlistId: 'acknowledged-id', addedTracks: 0});
    const retry = save();
    http.expectOne(`${environment.spotifyUrl}/playlists/acknowledged-id/items`).flush({});
    expect(await retry).toMatchObject({success: true, playlistId: 'acknowledged-id', recovery: {source: 'local-mapping', recovered: true}});
    http.expectNone(`${environment.spotifyUrl}/me/playlists`);
  });
}

it('cancels an in-flight account profile read before discovery or creation', async () => {
  const controller = new AbortController();
  const pending = service.createPlaylist('fixture-token', 'Name', '', [], {signal: controller.signal});
  const profile = http.expectOne(`${environment.spotifyUrl}/me`);
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(profile.cancelled).toBe(true);
  expect(await pending).toMatchObject({success: false, addedTracks: 0});
  expect(disk.size).toBe(0);
});

it('cancels a discovery429 cooldown before it can reread or create', async () => {
  const controller = new AbortController();
  const pending = service.createPlaylist('fixture-token', 'Name', '', [], {accountId: 'owner', signal: controller.signal});
  http.expectOne(discovery).flush({}, {status: 429, statusText: 'Limited', headers: {'Retry-After': '10'}});
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toMatchObject({success: false, addedTracks: 0});
  expect(disk.size).toBe(0);
});
