import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from './spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

describe('Cloud Backup activation acknowledgment and recovery boundaries', () => {
  let auth: SpotifyAuthService;
  let values: Map<string, string>;
  let storage: any;
  let cloud: any;
  let histories: Record<string, any[]>;
  beforeEach(async () => {
    values = new Map(); histories = {};
    storage = {initFromDB: async () => {}, getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
      hydrateAllFeatureData: vi.fn().mockResolvedValue(0), getStatsHistory: async (_owner: string, range: string) => histories[range] ?? [],
      getCacheKeys: () => [...values.keys()], shouldSyncUserCacheKey: (key: string) => key.startsWith('feature:')};
    cloud = {getClient: async () => ({auth: {getSession: async () => ({data: {session: null}, error: null})}}),
      updateBackupActive: vi.fn().mockResolvedValue(undefined), syncListeningHistory: vi.fn().mockResolvedValue(undefined),
      saveStatsSnapshot: vi.fn().mockResolvedValue(undefined), saveUserCache: vi.fn().mockResolvedValue(undefined)};
    TestBed.configureTestingModule({providers: [provideHttpClient(), {provide: StorageService, useValue: storage}, {provide: SupabaseService, useValue: cloud}]});
    auth = TestBed.inject(SpotifyAuthService); await auth.restoreSessionFromSupabase();
    values.set('spotifyUserId', 'listener'); values.set('supabaseUserId', 'cloud-listener');
    values.set('cloudIdentityReady', 'true'); values.set('cloud-listener_backup_active', 'false');
  });
  afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

  it('activates an empty backup only after hydration and server acknowledgment', async () => {
    let acknowledge!: () => void;
    cloud.updateBackupActive.mockReturnValue(new Promise<void>(resolve => acknowledge = resolve));
    const activation = auth.enableBackup();
    await vi.waitFor(() => expect(cloud.updateBackupActive).toHaveBeenCalledWith('cloud-listener', true));
    expect(storage.hydrateAllFeatureData).toHaveBeenCalledOnce();
    expect(values.get('cloud-listener_backup_active')).toBe('false');
    expect(auth.backupActivationState).toBe('syncing');
    acknowledge(); await activation;
    expect(values.get('cloud-listener_backup_active')).toBe('true');
    expect(auth.backupActivationState).toBe('active'); expect(auth.syncProgress).toBe(100);
    expect(auth.isSyncing).toBe(false);
    expect(cloud.saveUserCache).not.toHaveBeenCalled(); expect(cloud.saveStatsSnapshot).not.toHaveBeenCalled();
  });

  it.each(['{invalid', JSON.stringify({version: 2, completed: ['listening-history']}), JSON.stringify({version: 1, completed: 'invalid'})])('rebuilds unusable upload manifests and ignores malformed listening history (%s)', async manifest => {
    values.set('cloud-listener_backup_upload_manifest', manifest);
    values.set('listener_recently_played', '{invalid'); values.set('feature:playlists', 'isolated-playlists');
    await auth.enableBackup();
    expect(cloud.saveUserCache).toHaveBeenCalledExactlyOnceWith('cloud-listener', 'feature:playlists', 'isolated-playlists');
    expect(cloud.syncListeningHistory).not.toHaveBeenCalled();
    expect(values.has('cloud-listener_backup_upload_manifest')).toBe(false);
    expect(auth.backupActivationState).toBe('active');
  });

  it('uploads one detailed snapshot per range and day and preserves separate range histories', async () => {
    const date = '2026-10-16';
    histories['short_term'] = [{snapshotDate: date, topTracks: [{id: 'detailed'}], topArtists: [{id: 'artist'}], explicitPercentage: 12, genreDiversity: 7},
      {snapshotDate: date, topTracks: []}];
    histories['medium_term'] = [{snapshotDate: date, topGenres: ['jazz']}];
    await auth.enableBackup();
    expect(cloud.saveStatsSnapshot).toHaveBeenCalledTimes(2);
    expect(cloud.saveStatsSnapshot).toHaveBeenCalledWith('cloud-listener', 'short_term', 12, 7, [{id: 'detailed'}], [{id: 'artist'}], [], true, date);
    expect(cloud.saveStatsSnapshot).toHaveBeenCalledWith('cloud-listener', 'medium_term', 0, 0, [], [], ['jazz'], true, date);
  });

  it('assigns legacy snapshots before 01:00 to the prior local day', async () => {
    histories['short_term'] = [{timestamp: new Date(2026, 9, 16, 0, 30).getTime()}, {timestamp: new Date(2026, 9, 16, 1, 0).getTime()}];
    await auth.enableBackup();
    expect(cloud.saveStatsSnapshot.mock.calls.map((call: unknown[]) => call[8])).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('retains acknowledged uploads after partial failure and retries only the missing dataset', async () => {
    vi.useFakeTimers();
    values.set('listener_recently_played', JSON.stringify([{track: {id: 'track'}, played_at: '2026-10-16T12:00:00Z'}]));
    values.set('feature:playlists', 'isolated-playlists');
    cloud.saveUserCache.mockRejectedValue('isolated quota denied');
    const failed = auth.enableBackup(); const rejected = expect(failed).rejects.toThrow('isolated quota denied');
    await vi.runAllTimersAsync(); await rejected;
    expect(cloud.saveUserCache).toHaveBeenCalledTimes(3); expect(cloud.syncListeningHistory).toHaveBeenCalledOnce();
    expect(cloud.updateBackupActive).not.toHaveBeenCalled(); expect(auth.backupActivationState).toBe('failed'); expect(auth.isSyncing).toBe(false);
    const manifest = JSON.parse(values.get('cloud-listener_backup_upload_manifest')!);
    expect(manifest.completed).toEqual(['listening-history']); expect(manifest.failures).toEqual({'cache:feature:playlists': 'isolated quota denied'});
    cloud.saveUserCache.mockResolvedValue(undefined);
    await auth.enableBackup();
    expect(cloud.syncListeningHistory).toHaveBeenCalledOnce(); expect(cloud.saveUserCache).toHaveBeenCalledTimes(4);
    expect(auth.backupSyncFailures).toEqual([]); expect(auth.backupActivationState).toBe('active');
    expect(values.has('cloud-listener_backup_upload_manifest')).toBe(false);
  });

  it('recovers a transient upload failure within its three attempts before enabling backup', async () => {
    vi.useFakeTimers(); values.set('feature:playlists', 'isolated-playlists');
    cloud.saveUserCache.mockRejectedValueOnce(new Error('isolated transient')).mockResolvedValue(undefined);
    const activation = auth.enableBackup(); await vi.runAllTimersAsync(); await activation;
    expect(cloud.saveUserCache).toHaveBeenCalledTimes(2); expect(auth.backupSyncFailures).toEqual([]);
    expect(cloud.updateBackupActive).toHaveBeenCalledExactlyOnceWith('cloud-listener', true);
  });

  it('keeps the upload manifest when final activation acknowledgment fails so retry avoids duplicate data', async () => {
    values.set('feature:playlists', 'isolated-playlists'); cloud.updateBackupActive.mockRejectedValueOnce(new Error('isolated acknowledgment lost'));
    await expect(auth.enableBackup()).rejects.toThrow('isolated acknowledgment lost');
    expect(values.get('cloud-listener_backup_active')).toBe('false'); expect(auth.backupActivationState).toBe('failed');
    expect(JSON.parse(values.get('cloud-listener_backup_upload_manifest')!).completed).toEqual(['cache:feature:playlists']);
    await auth.enableBackup();
    expect(cloud.saveUserCache).toHaveBeenCalledOnce(); expect(cloud.updateBackupActive).toHaveBeenCalledTimes(2);
    expect(auth.backupActivationState).toBe('active');
  });

  it('does not enable backup when durable local hydration fails', async () => {
    storage.hydrateAllFeatureData.mockRejectedValue(new Error('isolated local database unavailable'));
    await expect(auth.enableBackup()).rejects.toThrow('isolated local database unavailable');
    expect(auth.backupActivationState).toBe('failed'); expect(cloud.updateBackupActive).not.toHaveBeenCalled();
    expect(values.get('cloud-listener_backup_active')).toBe('false');
  });

  it('requires a cloud identity to disable backup and retains active state if server update fails', async () => {
    values.delete('supabaseUserId'); await expect(auth.disableBackup()).rejects.toThrow('User not logged in');
    expect(cloud.updateBackupActive).not.toHaveBeenCalled();
    values.set('supabaseUserId', 'cloud-listener'); values.set('cloud-listener_backup_active', 'true'); auth.backupActivationState = 'active';
    cloud.updateBackupActive.mockRejectedValueOnce(new Error('isolated permission denied'));
    await expect(auth.disableBackup()).rejects.toThrow('isolated permission denied');
    expect(auth.backupActivationState).toBe('active'); expect(values.get('cloud-listener_backup_active')).toBe('true');
    await auth.disableBackup(); expect(auth.backupActivationState).toBe('idle'); expect(values.get('cloud-listener_backup_active')).toBe('false');
  });
});
