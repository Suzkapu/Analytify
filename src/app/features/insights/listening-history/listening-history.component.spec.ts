import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { of, throwError } from 'rxjs';
import { ListeningHistoryComponent } from './listening-history.component';

describe('ListeningHistoryComponent', () => {
    let storage: Map<string, string>;
    let spotify: {
        getRecentlyPlayed: Mock;
    };
    let component: ListeningHistoryComponent;

    beforeEach(() => {
        storage = new Map<string, string>();
        spotify = { getRecentlyPlayed: vi.fn().mockName('getRecentlyPlayed').mockReturnValue(of({ items: [] })) };
        component = new ListeningHistoryComponent(spotify as any, {
            getUserId: () => 'user',
            getSupabaseUserId: () => null,
            isBackupActive: () => false
        } as any, {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value)
        } as any, null as any);
    });

    it('uses the newest cached play as the Spotify after cursor', async () => {
        const playedAt = '2026-08-08T10:00:00.000Z';
        storage.set('user_recently_played', JSON.stringify([{ played_at: playedAt, track: { id: 'track' } }]));

        await component.loadRecentlyPlayed();

        expect(spotify.getRecentlyPlayed).toHaveBeenCalledTimes(1);

        expect(spotify.getRecentlyPlayed).toHaveBeenCalledWith(50, new Date(playedAt).getTime());
    });

    it('hydrates both history content and freshness metadata before choosing a source', async () => {
        const hydrateItems = vi.fn().mockResolvedValue(0);
        component = new ListeningHistoryComponent(spotify as any, {
            getUserId: () => 'user', getSupabaseUserId: () => null, isBackupActive: () => false
        } as any, {
            hydrateItems,
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value)
        } as any, null as any);

        await component.loadRecentlyPlayed();

        expect(hydrateItems).toHaveBeenCalledWith(['user_recently_played', 'user_recently_played_lastChecked']);
    });

    it('requests a render after an asynchronous cache hydrate', async () => {
        const markForCheck = vi.fn();
        storage.set('user_recently_played', JSON.stringify([{played_at: '2026-08-08T10:00:00.000Z', track: {id: 'track'}}]));
        storage.set('user_recently_played_lastChecked', Date.now().toString());
        component = new ListeningHistoryComponent(spotify as any, {
            getUserId: () => 'user', getSupabaseUserId: () => null, isBackupActive: () => false
        } as any, {
            hydrateItems: vi.fn().mockResolvedValue(0),
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value)
        } as any, null as any, {markForCheck} as any);

        await component.loadRecentlyPlayed();

        expect(markForCheck).toHaveBeenCalled();
        expect(component.isLoadingRecentlyPlayed).toBe(false);
    });

    it('shows loading immediately instead of an empty history state', () => {
        expect(component.isLoadingRecentlyPlayed).toBe(true);
    });

    it('skips Spotify when history was checked in the last five minutes', async () => {
        storage.set('user_recently_played', JSON.stringify([{
                played_at: '2026-08-08T10:00:00.000Z',
                track: { id: 'track' }
            }]));
        storage.set('user_recently_played_lastChecked', Date.now().toString());

        await component.loadRecentlyPlayed();

        expect(spotify.getRecentlyPlayed).not.toHaveBeenCalled();
    });

    it('groups plays by calendar day and exposes machine-readable timestamps', () => {
        const items = [
            { played_at: '2026-09-26T08:00:00.000Z', track: { id: 'new' } },
            { played_at: '2026-09-25T08:00:00.000Z', track: { id: 'old' } }
        ];
        (component as any).setRecentlyPlayedTracks(items);

        expect(component.historyDayGroups.map(group => group.key)).toEqual(['2026-09-26', '2026-09-25']);
        expect(component.playedAtDateTime(component.recentlyPlayedTracks[0].played_at)).toBe('2026-09-26T08:00:00.000Z');
        expect(component.playedAtDateTime('invalid')).toBeNull();
    });

    it('exposes a useful error state when Spotify fails without cached history', async () => {
        spotify.getRecentlyPlayed.mockReturnValue(throwError(() => new Error('offline')));

        await component.loadRecentlyPlayed();

        expect(component.isLoadingRecentlyPlayed).toBe(false);
        expect(component.recentlyPlayedError).toContain('could not load');
        expect(component.historyDayGroups).toEqual([]);
    });
});
