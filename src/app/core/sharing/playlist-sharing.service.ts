import {Injectable} from '@angular/core';
import {environment} from '@env/environment';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {CompareTrack} from '@core/compare-room/compare-room.models';
import {
  CreatedPlaylistShare,
  PlaylistShare,
  PlaylistShareDetails,
  PlaylistShareDownload,
  PlaylistSharePublication,
  SharedPlaylistStats
} from './playlist-sharing.models';

@Injectable({providedIn: 'root'})
export class PlaylistSharingService {
  constructor(private supabase: SupabaseService) {}

  async createShare(publication: PlaylistSharePublication): Promise<CreatedPlaylistShare> {
    const token = this.createClaimToken();
    const profile = await this.loadCurrentProfile();
    const {data, error} = await this.supabase.client.rpc('create_playlist_share', {
      p_source_playlist_id: publication.sourcePlaylistId,
      p_playlist_name: publication.playlistName,
      p_playlist_description: publication.playlistDescription,
      p_playlist_image_url: publication.playlistImageUrl,
      p_owner_display_name: profile.displayName,
      p_owner_image_url: profile.imageUrl,
      p_claim_token: token,
      p_tracks: publication.tracks
    });
    if (error) throw error;
    const shareId = String(data || '');
    if (!shareId) throw new Error('Supabase did not return a playlist share ID.');
    return {
      shareId,
      claimToken: token,
      claimUrl: `${environment.appUrl.replace(/\/$/, '')}/shared-playlists/claim/${encodeURIComponent(token)}`
    };
  }

  async claimShare(token: string): Promise<string> {
    const {data, error} = await this.supabase.client.rpc('claim_playlist_share', {
      p_claim_token: token
    });
    if (error) throw error;
    const shareId = String(data || '');
    if (!shareId) throw new Error('The shared playlist could not be claimed.');
    return shareId;
  }

  async listOwnedShares(): Promise<PlaylistShare[]> {
    const {data, error} = await this.supabase.client
      .from('playlist_shares')
      .select('*')
      .order('created_at', {ascending: false});
    if (error) throw error;
    const userId = await this.currentAuthUserId();
    return (data || [])
      .map(row => this.mapShare(row))
      .filter(share => share.ownerUserId === userId);
  }

  async listReceivedShares(): Promise<PlaylistShare[]> {
    const {data, error} = await this.supabase.client
      .from('playlist_shares')
      .select('*')
      .is('revoked_at', null)
      .order('updated_at', {ascending: false});
    if (error) throw error;
    const userId = await this.currentAuthUserId();
    return (data || [])
      .map(row => this.mapShare(row))
      .filter(share => share.recipientUserId === userId);
  }

  async listReceivedDownloads(): Promise<PlaylistShareDownload[]> {
    const {data, error} = await this.supabase.client
      .from('playlist_share_downloads')
      .select('*')
      .order('updated_at', {ascending: false});
    if (error) throw error;
    return (data || []).map(row => this.mapDownload(row));
  }

  async loadShare(shareId: string): Promise<PlaylistShareDetails> {
    const {data: shareRow, error: shareError} = await this.supabase.client
      .from('playlist_shares')
      .select('*')
      .eq('id', shareId)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!shareRow) throw new Error('This shared playlist is unavailable or has been revoked.');

    const trackRows = await this.loadAllShareTracks(shareId);

    const {data: downloadRow, error: downloadError} = await this.supabase.client
      .from('playlist_share_downloads')
      .select('*')
      .eq('share_id', shareId)
      .maybeSingle();
    if (downloadError) throw downloadError;

    const currentUserId = await this.currentAuthUserId();

    return {
      share: this.mapShare(shareRow),
      tracks: (trackRows || []).map(row => row.track as CompareTrack),
      download: downloadRow ? this.mapDownload(downloadRow) : null,
      viewerRole: shareRow.owner_user_id === currentUserId ? 'owner' : 'recipient'
    };
  }

  async refreshShare(shareId: string, publication: PlaylistSharePublication): Promise<number> {
    const {data, error} = await this.supabase.client.rpc('refresh_playlist_share', {
      p_share_id: shareId,
      p_playlist_name: publication.playlistName,
      p_playlist_description: publication.playlistDescription,
      p_playlist_image_url: publication.playlistImageUrl,
      p_tracks: publication.tracks
    });
    if (error) throw error;
    return Number(data || 0);
  }

  async refreshActiveSharesFromCache(
    sourcePlaylistId: string,
    playlistName: string,
    cachedArtists: any[]
  ): Promise<number> {
    const tracks = this.normalizeCachedTracks(cachedArtists);
    const {data, error} = await this.supabase.client.rpc('refresh_active_playlist_shares', {
      p_source_playlist_id: sourcePlaylistId,
      p_playlist_name: playlistName,
      p_tracks: tracks
    });
    if (error) throw error;
    return Number(data || 0);
  }

  subscribeToShareChanges(onChange: () => void, shareId?: string): () => void {
    const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const postgresFilter: any = {
      event: '*',
      schema: 'public',
      table: 'playlist_shares'
    };
    if (shareId) postgresFilter.filter = `id=eq.${shareId}`;
    const channel = this.supabase.client
      .channel(`playlist-share-updates:${suffix}`)
      .on('postgres_changes', postgresFilter, () => onChange())
      .subscribe();
    return () => {
      void this.supabase.client.removeChannel(channel);
    };
  }

  async revokeShare(shareId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('revoke_playlist_share', {
      p_share_id: shareId
    });
    if (error) throw error;
  }

  async recordDownload(
    shareId: string,
    spotifyPlaylistId: string,
    spotifyPlaylistUrl: string,
    appliedRevision: number
  ): Promise<void> {
    const {error} = await this.supabase.client.rpc('record_playlist_share_download', {
      p_share_id: shareId,
      p_spotify_playlist_id: spotifyPlaylistId,
      p_spotify_playlist_url: spotifyPlaylistUrl,
      p_applied_revision: appliedRevision
    });
    if (error) throw error;
  }

  normalizeCachedTracks(cachedArtists: any[]): CompareTrack[] {
    const tracks = new Map<string, CompareTrack>();
    (cachedArtists || []).forEach(artist => {
      (artist?.tracks || []).forEach((track: any) => {
        if (!track?.id || tracks.has(track.id)) return;
        const artists = (track.artists || [])
          .filter((item: any) => item?.id && item?.name)
          .map((item: any) => ({id: item.id, name: item.name}));
        if (!track.name || artists.length === 0) return;
        tracks.set(track.id, {
          id: track.id,
          uri: track.uri || `spotify:track:${track.id}`,
          name: track.name,
          artists,
          albumName: track.album?.name || '',
          imageUrl: track.album?.images?.[0]?.url || '',
          spotifyUrl: track.external_urls?.spotify || '',
          playlistIndex: Number(track.playlist_index || tracks.size + 1),
          durationMs: Number(track.duration_ms || 0),
          explicit: !!track.explicit,
          releaseDate: track.album?.release_date || ''
        });
      });
    });
    return Array.from(tracks.values()).sort((left, right) => left.playlistIndex - right.playlistIndex);
  }

  calculateStats(tracks: CompareTrack[]): SharedPlaylistStats {
    const artists = new Map<string, {id: string; name: string; count: number}>();
    const albums = new Map<string, number>();
    let durationMs = 0;
    let explicitTracks = 0;
    tracks.forEach(track => {
      durationMs += Number(track.durationMs || 0);
      if (track.explicit) explicitTracks++;
      track.artists.forEach(artist => {
        const current = artists.get(artist.id) || {...artist, count: 0};
        current.count++;
        artists.set(artist.id, current);
      });
      if (track.albumName) albums.set(track.albumName, (albums.get(track.albumName) || 0) + 1);
    });
    return {
      tracks: tracks.length,
      artists: artists.size,
      albums: albums.size,
      durationMs,
      explicitTracks,
      topArtists: Array.from(artists.values()).sort((a, b) => b.count - a.count).slice(0, 10),
      topAlbums: Array.from(albums.entries())
        .map(([name, count]) => ({name, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  private async currentAuthUserId(): Promise<string> {
    const {data, error} = await this.supabase.client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('A Supabase login is required for playlist sharing.');
    return data.user.id;
  }

  private async loadAllShareTracks(shareId: string): Promise<Array<{position: number; track: CompareTrack}>> {
    const pageSize = 500;
    const rows: Array<{position: number; track: CompareTrack}> = [];
    for (let from = 0; ; from += pageSize) {
      const {data, error} = await this.supabase.client
        .from('playlist_share_tracks')
        .select('position, track')
        .eq('share_id', shareId)
        .order('position', {ascending: true})
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Array<{position: number; track: CompareTrack}>;
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  private async loadCurrentProfile(): Promise<{displayName: string; imageUrl: string}> {
    const userId = await this.currentAuthUserId();
    const {data} = await this.supabase.client
      .from('users')
      .select('display_name, profile_pic_url')
      .eq('id', userId)
      .maybeSingle();
    return {
      displayName: data?.display_name || 'Spotify user',
      imageUrl: data?.profile_pic_url || ''
    };
  }

  private createClaimToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private mapShare(row: any): PlaylistShare {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      recipientUserId: row.recipient_user_id || null,
      sourcePlaylistId: row.source_playlist_id,
      playlistName: row.playlist_name,
      playlistDescription: row.playlist_description || '',
      playlistImageUrl: row.playlist_image_url || '',
      ownerDisplayName: row.owner_display_name || 'Spotify user',
      ownerImageUrl: row.owner_image_url || '',
      recipientDisplayName: row.recipient_display_name || null,
      trackCount: Number(row.track_count || 0),
      revision: Number(row.revision || 1),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      acceptedAt: row.accepted_at || null,
      revokedAt: row.revoked_at || null
    };
  }

  private mapDownload(row: any): PlaylistShareDownload {
    return {
      shareId: row.share_id,
      spotifyPlaylistId: row.spotify_playlist_id,
      spotifyPlaylistUrl: row.spotify_playlist_url || '',
      appliedRevision: Number(row.applied_revision || 0),
      updatedAt: row.updated_at
    };
  }
}
