import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { CompareTrack } from './compare-room.models';
import { ParticipantSpotifyService } from './participant-spotify.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('ParticipantSpotifyService', () => {
    beforeEach(() => {
        vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    let service: ParticipantSpotifyService;
    let http: HttpTestingController;
    let storage: Map<string, string>;

    beforeEach(() => {
        storage = new Map<string, string>();
        TestBed.configureTestingModule({
            imports: [],
            providers: [{
                    provide: StorageService,
                    useValue: {
                        getItem: (key: string) => storage.get(key) ?? null,
                        setItem: (key: string, value: string) => storage.set(key, value)
                    }
                }, provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting()]
        });
        service = TestBed.inject(ParticipantSpotifyService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('lists Liked Songs plus owned and collaborative playlists only', async () => {
        let result: any[] | undefined;
        void service.getPlaylists('guest-token', 'me').then(value => result = value);
        const request = http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`);
        expect(request.request.headers.get('Authorization')).toBe('Bearer guest-token');
        request.flush({
            total: 3,
            items: [
                { id: 'owned', name: 'Owned', owner: { id: 'me' }, collaborative: false, items: { total: 2 } },
                { id: 'collab', name: 'Collab', owner: { id: 'friend' }, collaborative: true, items: { total: 3 } },
                { id: 'followed', name: 'Followed', owner: { id: 'friend' }, collaborative: false, items: { total: 4 } }
            ]
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(result?.map(item => item.id)).toEqual(['fav', 'owned', 'collab']);
        expect(result?.[0].total).toBe(0);
    });

    it('creates a private playlist and adds tracks in batches of one hundred', async () => {
        const tracks = Array.from({ length: 205 }, (_, index) => track(`${index}`));
        let result: any;
        void service.createPlaylist('guest-token', 'Shared songs', 'Description', tracks, {
            accountId: 'account-a',
            operationId: 'proposal-a',
            fingerprint: 'revision-a'
        }).then(value => result = value);

        const discover = http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`);
        discover.flush({ total: 0, items: [] });
        await vi.advanceTimersByTimeAsync(0);

        const create = http.expectOne(`${environment.spotifyUrl}/me/playlists`);
        expect(create.request.body.public).toBe(false);
        expect(create.request.body.description).toMatch(/^Description \[Analytify operation:[0-9a-f]{16}\]$/);
        create.flush({ id: 'new-playlist', external_urls: { spotify: 'https://open.spotify.com/playlist/new' } });
        await vi.advanceTimersByTimeAsync(0);
        expect((service as any).operationMappings('account-a')).toEqual([expect.objectContaining({
            playlistId: 'new-playlist',
            fingerprint: 'revision-a'
        })]);

        for (const [method, expectedSize] of [['PUT', 100], ['POST', 100], ['POST', 5]] as const) {
            const add = http.expectOne(`${environment.spotifyUrl}/playlists/new-playlist/items`);
            expect(add.request.method).toBe(method);
            expect(add.request.body.uris.length).toBe(expectedSize);
            add.flush({ snapshot_id: 'snapshot' });
            await vi.advanceTimersByTimeAsync(0);
        }

        expect(result.success).toBe(true);
        expect(result.addedTracks).toBe(205);
        expect(result.playlistUrl).toContain('/new');
        expect(result.operationFingerprint).toBe('revision-a');
        expect(result.recovery).toEqual({ source: 'created', recovered: false });
    });

    it('discovers an owned playlist after a lost create response and resumes with PUT then POST', async () => {
        const tracks = Array.from({ length: 101 }, (_, index) => track(`${index}`));
        const options = { accountId: 'account-a', operationId: 'proposal-a', fingerprint: 'revision-a' };
        let firstResult: any;
        void service.createPlaylist('guest-token', 'Shared songs', 'Description', tracks, options)
            .then(value => firstResult = value);

        http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`)
            .flush({ total: 0, items: [] });
        await vi.advanceTimersByTimeAsync(0);
        const create = http.expectOne(`${environment.spotifyUrl}/me/playlists`);
        const marker = create.request.body.description.match(/\[Analytify operation:[0-9a-f]{16}\]/)?.[0];
        create.flush({ message: 'gateway timeout' }, { status: 504, statusText: 'Gateway Timeout' });
        await vi.advanceTimersByTimeAsync(0);
        expect(firstResult.success).toBe(false);

        let retryResult: any;
        void service.createPlaylist('guest-token', 'Shared songs', 'Description', tracks, options)
            .then(value => retryResult = value);
        http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`).flush({
            total: 1,
            items: [{
                id: 'created-despite-timeout',
                name: 'Shared songs',
                description: `Description ${marker}`,
                owner: { id: 'account-a' },
                external_urls: { spotify: 'https://open.spotify.com/playlist/recovered' }
            }]
        });
        await vi.advanceTimersByTimeAsync(0);

        const replace = http.expectOne(`${environment.spotifyUrl}/playlists/created-despite-timeout/items`);
        expect(replace.request.method).toBe('PUT');
        expect(replace.request.body.uris.length).toBe(100);
        replace.flush({ snapshot_id: 'replace' });
        await vi.advanceTimersByTimeAsync(0);
        const append = http.expectOne(`${environment.spotifyUrl}/playlists/created-despite-timeout/items`);
        expect(append.request.method).toBe('POST');
        expect(append.request.body.uris.length).toBe(1);
        append.flush({ snapshot_id: 'append' });
        await vi.advanceTimersByTimeAsync(0);

        expect(retryResult.success).toBe(true);
        expect(retryResult.playlistId).toBe('created-despite-timeout');
        expect(retryResult.recovery).toEqual({ source: 'spotify-discovery', recovered: true });
    });

    it('replaces a partial multi-batch playlist on retry without creating a duplicate', async () => {
        const tracks = Array.from({ length: 150 }, (_, index) => track(`${index}`));
        const options = { accountId: 'account-a', operationId: 'proposal-b', fingerprint: 'revision-b' };
        let firstResult: any;
        void service.createPlaylist('guest-token', 'Batch recovery', 'Description', tracks, options)
            .then(value => firstResult = value);
        http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`).flush({ total: 0, items: [] });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/me/playlists`).flush({
            id: 'partial-playlist', external_urls: { spotify: 'partial-url' }
        });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/playlists/partial-playlist/items`).flush({ snapshot_id: 'first' });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/playlists/partial-playlist/items`)
            .flush({ error: { message: 'temporary failure' } }, { status: 500, statusText: 'Server Error' });
        await vi.advanceTimersByTimeAsync(0);

        expect(firstResult).toEqual(expect.objectContaining({
            success: false, playlistId: 'partial-playlist', addedTracks: 100
        }));

        let retryResult: any;
        void service.createPlaylist('guest-token', 'Batch recovery', 'Description', tracks, options)
            .then(value => retryResult = value);
        const replace = http.expectOne(`${environment.spotifyUrl}/playlists/partial-playlist/items`);
        expect(replace.request.method).toBe('PUT');
        replace.flush({ snapshot_id: 'replace' });
        await vi.advanceTimersByTimeAsync(0);
        const append = http.expectOne(`${environment.spotifyUrl}/playlists/partial-playlist/items`);
        expect(append.request.method).toBe('POST');
        append.flush({ snapshot_id: 'append' });
        await vi.advanceTimersByTimeAsync(0);

        http.expectNone(`${environment.spotifyUrl}/me/playlists`);
        expect(retryResult).toEqual(expect.objectContaining({
            success: true, playlistId: 'partial-playlist', addedTracks: 150
        }));
    });

    it('recovers a stale account mapping once when Spotify returns 404', async () => {
        const options = { accountId: 'account-a', operationId: 'proposal-a', fingerprint: 'revision-a' };
        (service as any).rememberOperationMapping('account-a', (service as any).stableOperationId('proposal-a'),
            'revision-a', { id: 'deleted-playlist', external_urls: { spotify: 'old-url' } });
        let result: any;
        void service.createPlaylist('guest-token', 'Shared songs', 'Description', [track('1')], options)
            .then(value => result = value);

        http.expectOne(`${environment.spotifyUrl}/playlists/deleted-playlist/items`)
            .flush({ error: { message: 'Not found' } }, { status: 404, statusText: 'Not Found' });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`)
            .flush({ total: 0, items: [] });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/me/playlists`).flush({
            id: 'replacement-playlist',
            external_urls: { spotify: 'replacement-url' }
        });
        await vi.advanceTimersByTimeAsync(0);
        http.expectOne(`${environment.spotifyUrl}/playlists/replacement-playlist/items`)
            .flush({ snapshot_id: 'replacement' });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.success).toBe(true);
        expect(result.playlistId).toBe('replacement-playlist');
        expect(result.recovery).toEqual({
            source: 'stale-mapping-recreated',
            recovered: true,
            stalePlaylistId: 'deleted-playlist'
        });
    });

    it('keeps operation mappings account-scoped and bounded to twenty recent entries', () => {
        for (let index = 0; index < 25; index++) {
            (service as any).rememberOperationMapping('account-a', `operation-${index}`, `revision-${index}`, {
                id: `playlist-${index}`
            });
        }

        const accountAMappings = (service as any).operationMappings('account-a');
        expect(accountAMappings).toHaveLength(20);
        expect(accountAMappings[0].playlistId).toBe('playlist-24');
        expect(accountAMappings.some((entry: any) => entry.playlistId === 'playlist-0')).toBe(false);
        expect((service as any).operationMappings('account-b')).toEqual([]);
    });

    it('reconstructs Spotify URIs for tracks from the persistent Analytify cache', () => {
        const result = service.normalizeCachedTracks([{
                id: 'artist',
                tracks: [{
                        id: 'cached-track',
                        name: 'Cached track',
                        artists: [{ id: 'artist', name: 'Artist' }],
                        playlist_index: 7,
                        external_urls: { spotify: 'https://open.spotify.com/track/cached-track' },
                        album: { name: 'Cached album', images: [{ url: 'cover.jpg' }] }
                    }]
            }]);

        expect(result.length).toBe(1);
        expect(result[0].uri).toBe('spotify:track:cached-track');
        expect(result[0].playlistIndex).toBe(7);
    });

    it('updates an existing downloaded playlist in place and replaces its first batch', async () => {
        const tracks = Array.from({ length: 105 }, (_, index) => track(`${index}`));
        let result: any;
        void service.syncPlaylist('recipient-token', 'existing-playlist', 'https://open.spotify.com/playlist/existing-playlist', 'Updated share', 'Analytify Share ID: share-id', tracks).then(value => result = value);

        const details = http.expectOne(`${environment.spotifyUrl}/playlists/existing-playlist`);
        expect(details.request.method).toBe('PUT');
        expect(details.request.body.name).toBe('Updated share');
        details.flush(null);
        await vi.advanceTimersByTimeAsync(0);

        const replace = http.expectOne(`${environment.spotifyUrl}/playlists/existing-playlist/items`);
        expect(replace.request.method).toBe('PUT');
        expect(replace.request.body.uris.length).toBe(100);
        replace.flush({ snapshot_id: 'replacement' });
        await vi.advanceTimersByTimeAsync(0);

        const append = http.expectOne(`${environment.spotifyUrl}/playlists/existing-playlist/items`);
        expect(append.request.method).toBe('POST');
        expect(append.request.body.uris.length).toBe(5);
        append.flush({ snapshot_id: 'append' });
        await vi.advanceTimersByTimeAsync(0);

        expect(result.success).toBe(true);
        expect(result.playlistId).toBe('existing-playlist');
        expect(result.addedTracks).toBe(105);
    });

    it('skips an unchanged playlist metadata write on later shared-copy revisions', async () => {
        (service as any).rememberAppliedMetadata('existing-playlist', 'Shared copy', 'Analytify Share ID: share-id');
        void service.syncPlaylist('recipient-token', 'existing-playlist', null, 'Shared copy', 'Analytify Share ID: share-id', [track('1')]);

        const replace = http.expectOne(`${environment.spotifyUrl}/playlists/existing-playlist/items`);
        expect(replace.request.method).toBe('PUT');
        replace.flush({ snapshot_id: 'replacement' });
        await vi.advanceTimersByTimeAsync(0);

        http.expectNone(`${environment.spotifyUrl}/playlists/existing-playlist`);
    });

    it('cancels an in-flight Spotify mutation when its session ends', async () => {
        const controller = new AbortController();
        let result: any;
        void service.syncPlaylist('account-a-token', 'existing-playlist', null, 'Account A share', 'Description', [track('1')], controller.signal).then(value => result = value);
        const request = http.expectOne(`${environment.spotifyUrl}/playlists/existing-playlist`);

        controller.abort();
        await vi.advanceTimersByTimeAsync(0);

        expect(request.cancelled).toBe(true);
        expect(result.success).toBe(false);
        expect(result.addedTracks).toBe(0);
    });

    function track(id: string): CompareTrack {
        return {
            id,
            uri: `spotify:track:${id}`,
            name: `Track ${id}`,
            artists: [{ id: 'artist', name: 'Artist' }],
            albumName: '',
            imageUrl: '',
            spotifyUrl: '',
            playlistIndex: Number(id) + 1
        };
    }
});
