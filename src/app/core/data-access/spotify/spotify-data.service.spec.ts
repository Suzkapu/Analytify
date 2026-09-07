import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SpotifyDataService } from './spotify-data.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { EMPTY, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('SpotifyDataService', () => {
    beforeEach(() => {
        vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    let service: SpotifyDataService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [],
            providers: [
                { provide: SpotifyAuthService, useValue: {} },
                { provide: StorageService, useValue: { getItem: () => null, setItem: vi.fn().mockName('setItem') } },
                provideHttpClient(withXhr(), withInterceptorsFromDi()),
                provideHttpClientTesting()
            ]
        });
        service = TestBed.inject(SpotifyDataService);
        http = TestBed.inject(HttpTestingController);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('keeps owned and collaborative playlists while excluding inaccessible playlists', async () => {
        vi.spyOn(service, 'getCurrentUser').mockReturnValue(of({ id: 'current-user' }));
        vi.spyOn(service, 'getAllUserPlaylists').mockReturnValue(of({
            total: 3,
            items: [
                { id: 'owned', owner: { id: 'current-user' }, collaborative: false },
                { id: 'shared', owner: { id: 'other-user' }, collaborative: true },
                { id: 'private', owner: { id: 'other-user' }, collaborative: false }
            ]
        }));

        const result = await firstValueFrom(service.getAccessibleUserPlaylists());

        expect(result.currentUserId).toBe('current-user');
        expect(result.items.map((playlist: any) => playlist.id)).toEqual(['owned', 'shared']);
    });

    it('skips the profile request when the Spotify user ID is already known', async () => {
        const profileRequest = vi.spyOn(service, 'getCurrentUser').mockReturnValue(EMPTY);
        vi.spyOn(service, 'getAllUserPlaylists').mockReturnValue(of({
            total: 1,
            items: [{ id: 'owned', owner: { id: 'current-user' }, collaborative: false }]
        }));

        const result = await firstValueFrom(service.getAccessibleUserPlaylists('current-user'));

        expect(profileRequest).not.toHaveBeenCalled();
        expect(result.currentUserId).toBe('current-user');
        expect(result.items.map((playlist: any) => playlist.id)).toEqual(['owned']);
    });

    it('can include followed playlists for the overview saved-playlist toggle', async () => {
        vi.spyOn(service, 'getAllUserPlaylists').mockReturnValue(of({
            total: 2,
            items: [
                { id: 'owned', owner: { id: 'current-user' }, collaborative: false },
                { id: 'saved', owner: { id: 'other-user' }, collaborative: false }
            ]
        }));

        const result = await firstValueFrom(service.getAccessibleUserPlaylists('current-user', true));

        expect(result.items.map((playlist: any) => playlist.id)).toEqual(['owned', 'saved']);
    });

    it('normalizes playlist item payloads into the track shape used by the UI', async () => {
        vi.spyOn(service, 'makeRequest').mockReturnValue(of({
            id: 'playlist',
            items: {
                total: 1,
                items: [{ added_at: 'today', item: { id: 'track', name: 'Track' } }]
            }
        }));

        const result = await firstValueFrom(service.getSinglePlaylist('playlist'));

        expect(result.tracks.total).toBe(1);
        expect(result.tracks.items[0].track.id).toBe('track');
        expect(result.tracks.items[0].added_at).toBe('today');
    });

    it('does not call Spotify for empty artist or track batches', async () => {
        const artistRequest = vi.spyOn(service, 'getSingleArtist').mockReturnValue(EMPTY);
        const trackRequest = vi.spyOn(service, 'getSingleTrack').mockReturnValue(EMPTY);

        expect(await firstValueFrom(service.getArtistsByIds([]))).toEqual({ artists: [] });
        expect(await firstValueFrom(service.getTracksByIds([]))).toEqual({ tracks: [] });
        expect(artistRequest).not.toHaveBeenCalled();
        expect(trackRequest).not.toHaveBeenCalled();
    });

    it('loads artist profiles with bounded parallel requests', async () => {
        const subjects = new Map(['one', 'two', 'three', 'four', 'five'].map(id => [id, new Subject<any>()]));
        const artistRequest = vi.spyOn(service, 'getSingleArtist').mockImplementation(id => subjects.get(id)!.asObservable());

        const resultPromise = firstValueFrom(service.getArtistsByIds(Array.from(subjects.keys())));

        expect(artistRequest).toHaveBeenCalledTimes(4);
        subjects.get('one')!.next({ id: 'one' });
        subjects.get('one')!.complete();
        expect(artistRequest).toHaveBeenCalledTimes(5);

        ['two', 'three', 'four', 'five'].forEach(id => {
            subjects.get(id)!.next({ id });
            subjects.get(id)!.complete();
        });
        const result = await resultPromise;

        expect(result.artists.map((artist: any) => artist.id).sort())
            .toEqual(['five', 'four', 'one', 'three', 'two']);
    });

    it('does not retry a Spotify quota-exceeded response', async () => {
        const quotaError = { status: 429, error: { reason: 'QUOTA_EXCEEDED' } };
        const request = vi.fn().mockName('request').mockReturnValue(throwError(() => quotaError));

        await expect(firstValueFrom(service.makeRequest(request))).rejects.toEqual(quotaError);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('searches at most ten Spotify tracks with an encoded query', async () => {
        let response: any;
        service.searchTracks('new & rare', 50).subscribe(value => response = value);
        await vi.advanceTimersByTimeAsync(0);
        const request = http.expectOne(request => request.url.includes('/search')
            && request.url.includes('type=track')
            && request.url.includes('limit=10')
            && request.url.includes('q=new%20%26%20rare'));
        request.flush({ tracks: { items: [] } });

        expect(response.tracks.items).toEqual([]);
    });

    it('creates app-generated Spotify playlists as private by default', async () => {
        let response: any;
        service.createPlaylist('Top tracks', 'Created by Analytify').subscribe(value => response = value);
        await vi.advanceTimersByTimeAsync(0);

        const request = http.expectOne(request => request.url.endsWith('/me/playlists'));
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({
            name: 'Top tracks',
            description: 'Created by Analytify',
            public: false
        });
        request.flush({ id: 'private-playlist' });
        expect(response.id).toBe('private-playlist');
    });
});
