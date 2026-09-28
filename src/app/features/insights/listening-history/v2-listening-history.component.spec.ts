import {describe, expect, it, vi} from 'vitest';
import {V2ListeningHistoryComponent} from './v2-listening-history.component';

describe('V2ListeningHistoryComponent', () => {
  const createComponent = () => new V2ListeningHistoryComponent(
    {getRecentlyPlayed: vi.fn()} as any,
    {getUserId: () => 'listener', getSupabaseUserId: () => null, isBackupActive: () => false} as any,
    {getItem: () => null, setItem: vi.fn()} as any,
    null as any
  );

  it('reuses the shared history view model and groups plays for the native v2 presentation', () => {
    const component = createComponent();
    (component as any).setRecentlyPlayedTracks([
      {played_at: '2026-09-26T10:00:00.000Z', track: {id: 'one'}},
      {played_at: '2026-09-25T10:00:00.000Z', track: {id: 'two'}}
    ]);

    expect(component.historyDayGroups.map(group => group.key)).toEqual(['2026-09-26', '2026-09-25']);
  });

  it('opens artwork only when Spotify supplied a destination', () => {
    const component = createComponent();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    component.openTrackClick('');
    component.openTrackClick('https://open.spotify.com/track/track-id');

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith('https://open.spotify.com/track/track-id', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
