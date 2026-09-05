import {Injectable} from '@angular/core';
import {firstValueFrom, forkJoin} from 'rxjs';

import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {environment} from '@env/environment';
import {
  CreatedSongLeague,
  SongLeague,
  SongLeagueDashboard,
  SongLeagueMember,
  SongLeaguePlaylist,
  SongLeagueRecommendation,
  SongLeagueScoreBreakdown,
  SongLeagueStanding,
  SongLeagueTrack
} from './song-league.models';

@Injectable({providedIn: 'root'})
export class SongLeagueService {
  private readonly shortTermRefreshes = new Map<string, Promise<{
    refreshed: boolean;
    snapshotDate: string;
  }>>();

  constructor(
    private supabase: SupabaseService,
    private spotify: SpotifyDataService
  ) {}

  async createLeague(name: string, timezone: string, maxMembers = 5): Promise<CreatedSongLeague> {
    const inviteToken = this.createToken();
    const {data, error} = await this.supabase.client.rpc('create_song_league', {
      p_name: name,
      p_timezone: timezone,
      p_invite_token: inviteToken
    });
    if (error) throw error;
    const leagueId = String(data || '');
    if (!leagueId) throw new Error('Supabase did not return a Song League ID.');
    if (maxMembers && maxMembers >= 2 && maxMembers <= 50 && maxMembers !== 5) {
      await this.setMemberLimit(leagueId, maxMembers);
    }
    return {leagueId, inviteToken, inviteUrl: this.inviteUrl(inviteToken)};
  }

  async createInvite(leagueId: string): Promise<{token: string; url: string}> {
    const token = this.createToken();
    const {error} = await this.supabase.client.rpc('rotate_song_league_invite', {
      p_league_id: leagueId,
      p_invite_token: token
    });
    if (error) throw error;
    return {token, url: this.inviteUrl(token)};
  }

  async setMemberLimit(leagueId: string, maxMembers: number): Promise<number> {
    const {data, error} = await this.supabase.client.rpc('set_song_league_member_limit', {
      p_league_id: leagueId,
      p_max_members: maxMembers
    });
    if (error) throw error;
    return Number(data);
  }

  async claimLeague(token: string): Promise<string> {
    const {data, error} = await this.supabase.client.rpc('claim_song_league', {
      p_invite_token: token
    });
    if (error) throw error;
    const leagueId = String(data || '');
    if (!leagueId) throw new Error('The Song League could not be joined.');
    return leagueId;
  }

  async leaveLeague(leagueId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('leave_song_league', {p_league_id: leagueId});
    if (error) throw error;
  }

  async closeLeague(leagueId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('close_song_league', {p_league_id: leagueId});
    if (error) throw error;
  }

  async deleteLeague(leagueId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('delete_song_league', {p_league_id: leagueId});
    if (error) throw error;
  }

  async listLeagues(): Promise<SongLeague[]> {
    const {data, error} = await this.supabase.client
      .from('song_leagues')
      .select('*')
      .is('closed_at', null)
      .order('created_at', {ascending: false});
    if (error) throw error;
    return (data || []).map(row => this.mapLeague(row));
  }

  async loadDashboard(leagueId: string): Promise<SongLeagueDashboard> {
    const [leagueResult, memberResult, recommendationResult, playlistResult] = await Promise.all([
      this.supabase.client.from('song_leagues').select('*').eq('id', leagueId).maybeSingle(),
      this.supabase.client.from('song_league_members').select('*')
        .eq('league_id', leagueId).is('left_at', null).order('joined_at', {ascending: true}),
      this.supabase.client.from('song_league_recommendations').select('*')
        .eq('league_id', leagueId).gte('scoring_ends_at', new Date().toISOString())
        .order('submitted_at', {ascending: false}),
      this.supabase.client.from('song_league_playlists').select('*')
        .eq('league_id', leagueId).order('updated_at', {ascending: false})
    ]);
    if (leagueResult.error) throw leagueResult.error;
    if (!leagueResult.data) throw new Error('This Song League is unavailable.');
    if (memberResult.error) throw memberResult.error;
    if (recommendationResult.error) throw recommendationResult.error;
    if (playlistResult.error) throw playlistResult.error;

    const members = (memberResult.data || []).map(row => this.mapMember(row));
    const breakdownByRecommender = new Map<string, SongLeagueScoreBreakdown[]>();
    await Promise.all(members.map(async member => {
      breakdownByRecommender.set(member.userId, await this.loadScoreBreakdown(leagueId, member.userId));
    }));
    const standings = await this.loadStandings(leagueId, members, breakdownByRecommender);

    return {
      league: this.mapLeague(leagueResult.data),
      members,
      standings,
      recommendations: (recommendationResult.data || []).map(row => this.mapRecommendation(row)),
      playlists: (playlistResult.data || []).map(row => this.mapPlaylist(row)),
      breakdownByRecommender
    };
  }

  async loadScoreBreakdown(leagueId: string, recommenderUserId: string): Promise<SongLeagueScoreBreakdown[]> {
    const {data, error} = await this.supabase.client.rpc('get_song_league_score_breakdown', {
      p_league_id: leagueId,
      p_recommender_user_id: recommenderUserId
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      recommendationId: row.recommendation_id,
      trackId: row.track_id,
      trackName: row.track_name,
      artistNames: row.artist_names,
      imageUrl: row.image_url || '',
      spotifyUrl: row.spotify_url || '',
      submittedAt: row.submitted_at,
      scoringStartsAt: row.scoring_starts_at,
      scoringEndsAt: row.scoring_ends_at,
      listenerUserId: row.listener_user_id,
      listenerDisplayName: row.listener_display_name,
      totalPoints: Number(row.total_points || 0),
      latestRank: row.latest_rank === null ? null : Number(row.latest_rank),
      latestListSize: row.latest_list_size === null ? null : Number(row.latest_list_size),
      latestPoints: Number(row.latest_points || 0),
      latestSnapshotDate: row.latest_snapshot_date || null
    }));
  }

  async searchTracks(query: string): Promise<SongLeagueTrack[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const response = await firstValueFrom(this.spotify.searchTracks(trimmed, 10));
    return (response?.tracks?.items || []).filter((track: SongLeagueTrack) =>
      !!track?.id && !track.is_local
    );
  }

  async loadTrackFromSpotifyUrl(value: string): Promise<SongLeagueTrack> {
    const trackId = this.parseSpotifyTrackId(value);
    if (!trackId) throw new Error('Paste a valid Spotify track URL or URI.');
    return await firstValueFrom(this.spotify.getSingleTrack(trackId));
  }

  async submitRecommendation(leagueId: string, track: SongLeagueTrack, isDemo = false): Promise<string> {
    if (!track?.id) throw new Error('Choose a Spotify track first.');
    await this.supabase.syncTracks([track]);
    const {data, error} = await this.supabase.client.rpc(
      isDemo ? 'submit_song_league_demo_recommendation' : 'submit_song_league_recommendation', {
      p_league_id: leagueId,
      p_track_id: track.id
    });
    if (error) throw error;
    const recommendationId = String(data || '');
    if (!recommendationId) throw new Error('The recommendation was not saved.');
    return recommendationId;
  }

  async syncWeeklyPlaylists(leagueId: string, createForCurrentUser = false): Promise<void> {
    const {data, error} = await this.supabase.client.functions.invoke('song-league-playlist-sync', {
      body: {leagueId, createForCurrentUser}
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.ok === false) {
      const failed = Number(data.failed || 0);
      throw new Error(`${failed || 'Some'} member ${failed === 1 ? 'playlist needs' : 'playlists need'} a Spotify reconnect.`);
    }
  }

  subscribeToLeague(leagueId: string, onChange: () => void): () => void {
    const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const channel = this.supabase.client
      .channel(`song-league:${leagueId}:${suffix}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'song_league_recommendations', filter: `league_id=eq.${leagueId}`
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'song_league_score_events', filter: `league_id=eq.${leagueId}`
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'song_league_playlists', filter: `league_id=eq.${leagueId}`
      }, onChange)
      .subscribe();
    return () => { void this.supabase.client.removeChannel(channel); };
  }

  async currentUserId(): Promise<string> {
    const {data, error} = await this.supabase.client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('A Supabase login is required for Song League.');
    return data.user.id;
  }

  async ensureMemberReadyForLeague(
    leagueId: string,
    timezone: string,
    now: Date = new Date()
  ): Promise<{refreshed: boolean; snapshotDate: string}> {
    const {error: settingsError} = await this.supabase.client.rpc(
      'ensure_song_league_member_sync',
      {p_league_id: leagueId}
    );
    if (settingsError) throw settingsError;

    const userId = await this.currentUserId();
    const snapshotDate = this.dateInTimezone(now, timezone);
    const refreshKey = `${userId}:${snapshotDate}`;
    const activeRefresh = this.shortTermRefreshes.get(refreshKey);
    if (activeRefresh) return activeRefresh;

    const refresh = this.ensureFreshShortTermStats(userId, snapshotDate).finally(() => {
      if (this.shortTermRefreshes.get(refreshKey) === refresh) {
        this.shortTermRefreshes.delete(refreshKey);
      }
    });
    this.shortTermRefreshes.set(refreshKey, refresh);
    return refresh;
  }

  isFridayInTimezone(timezone: string, now: Date = new Date()): boolean {
    const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone: timezone}).format(now);
    return weekday === 'Fri';
  }

  private async ensureFreshShortTermStats(
    userId: string,
    snapshotDate: string
  ): Promise<{refreshed: boolean; snapshotDate: string}> {
    const existing = await this.supabase.loadLatestStatsSnapshot(userId, 'short_term', 2);
    if (
      existing?.snapshotDate === snapshotDate
      && Array.isArray(existing.topTracks)
      && existing.topTracks.length > 0
    ) {
      return {refreshed: false, snapshotDate};
    }

    const response = await firstValueFrom(forkJoin({
      artists: this.spotify.getUserTopArtists('short_term', 50, 0),
      tracks: this.spotify.getUserTopTracks('short_term', 50, 0),
      tracksPage2: this.spotify.getUserTopTracks('short_term', 50, 50)
    }));
    const topArtists = response.artists?.items || [];
    const topTracks = [
      ...(response.tracks?.items || []),
      ...(response.tracksPage2?.items || [])
    ];
    if (topTracks.length === 0) {
      throw new Error('Spotify did not return short-term Top Songs for today.');
    }
    const topGenres = this.genresFromArtists(topArtists);
    const explicitCount = topTracks.filter((track: any) => !!track?.explicit).length;
    const explicitPercentage = Math.round((explicitCount / topTracks.length) * 100);
    await this.supabase.saveStatsSnapshot(
      userId,
      'short_term',
      explicitPercentage,
      topGenres.length,
      topTracks,
      topArtists,
      topGenres,
      false,
      snapshotDate
    );
    return {refreshed: true, snapshotDate};
  }

  private genresFromArtists(artists: any[]): Array<{
    name: string;
    count: number;
    percentage: number;
    percentage_simple: number;
  }> {
    const weights = new Map<string, number>();
    artists.forEach((artist, index) => {
      const rankWeight = Math.max(1, 50 - index);
      (artist?.genres || []).forEach((name: string) => {
        const normalized = name?.trim();
        if (normalized && normalized.toLowerCase() !== 'artist') {
          weights.set(normalized, (weights.get(normalized) || 0) + rankWeight);
        }
      });
    });
    const totalWeight = Array.from(weights.values()).reduce((sum, weight) => sum + weight, 0);
    return Array.from(weights.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 15)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalWeight ? (count / totalWeight) * 100 : 0,
        percentage_simple: totalWeight ? (count / totalWeight) * 100 : 0
      }));
  }

  private dateInTimezone(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const value = (type: string) => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private inviteUrl(token: string): string {
    return `${environment.appUrl.replace(/\/$/, '')}/song-league/join/${encodeURIComponent(token)}`;
  }

  private createToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private parseSpotifyTrackId(value: string): string | null {
    const trimmed = value.trim();
    const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (uriMatch) return uriMatch[1];
    try {
      const url = new URL(trimmed);
      if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;
      const match = url.pathname.match(/^\/track\/([A-Za-z0-9]{22})(?:\/|$)/);
      return match?.[1] || null;
    } catch {
      return null;
    }
  }

  private mapLeague(row: any): SongLeague {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      timezone: row.timezone,
      ownerDisplayName: row.owner_display_name || 'Spotify user',
      ownerImageUrl: row.owner_image_url || '',
      playlistRevision: Number(row.playlist_revision || 0),
      maxMembers: Number(row.max_members || 5),
      isDemo: !!row.is_demo,
      createdAt: row.created_at
    };
  }

  private mapMember(row: any): SongLeagueMember {
    return {
      leagueId: row.league_id,
      userId: row.user_id,
      role: row.role,
      displayName: row.display_name,
      imageUrl: row.image_url || '',
      joinedAt: row.joined_at
    };
  }

  private async loadStandings(
    leagueId: string,
    members: SongLeagueMember[],
    breakdownByRecommender: Map<string, SongLeagueScoreBreakdown[]>
  ): Promise<SongLeagueStanding[]> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 6);
    const {data: recentEvents, error} = await this.supabase.client
      .from('song_league_score_events')
      .select('recommendation_id, points')
      .eq('league_id', leagueId)
      .gte('snapshot_date', cutoff.toISOString().slice(0, 10));
    if (error) throw error;

    const recommenderByRecommendation = new Map<string, string>();
    breakdownByRecommender.forEach((rows, recommenderUserId) => {
      rows.forEach(row => recommenderByRecommendation.set(row.recommendationId, recommenderUserId));
    });
    const recentPoints = new Map<string, number>();
    (recentEvents || []).forEach((event: any) => {
      const recommenderUserId = recommenderByRecommendation.get(event.recommendation_id);
      if (!recommenderUserId) return;
      recentPoints.set(
        recommenderUserId,
        (recentPoints.get(recommenderUserId) || 0) + Number(event.points || 0)
      );
    });

    return members.map(member => ({
      ...member,
      totalPoints: (breakdownByRecommender.get(member.userId) || [])
        .reduce((sum, row) => sum + row.totalPoints, 0),
      lastSevenDaysPoints: recentPoints.get(member.userId) || 0
    })).sort((left, right) =>
      right.totalPoints - left.totalPoints
      || new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime()
    );
  }

  private mapRecommendation(row: any): SongLeagueRecommendation {
    return {
      id: row.id,
      leagueId: row.league_id,
      roundId: row.round_id,
      recommenderUserId: row.recommender_user_id,
      trackId: row.track_id,
      recordingKey: row.recording_key,
      isrc: row.isrc || null,
      trackName: row.track_name,
      artistNames: row.artist_names,
      albumName: row.album_name || '',
      imageUrl: row.image_url || '',
      spotifyUrl: row.spotify_url || '',
      submittedAt: row.submitted_at,
      scoringStartsAt: row.scoring_starts_at,
      scoringEndsAt: row.scoring_ends_at
    };
  }

  private mapPlaylist(row: any): SongLeaguePlaylist {
    return {
      leagueId: row.league_id,
      userId: row.user_id,
      spotifyPlaylistId: row.spotify_playlist_id || null,
      spotifyPlaylistUrl: row.spotify_playlist_url || '',
      lastSyncedRevision: Number(row.last_synced_revision || 0),
      lastSyncedRoundId: row.last_synced_round_id || null,
      lastSyncedAt: row.last_synced_at || null,
      lastError: row.last_error || null
    };
  }
}
