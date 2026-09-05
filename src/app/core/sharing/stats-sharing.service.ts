import {Injectable} from '@angular/core';
import {environment} from '@env/environment';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {
  CreatedStatsAccessInvite,
  SharedStatsSnapshot,
  StatsAccessRequest,
  StatsAccessStatus,
  StatsShareableUser
} from './stats-sharing.models';

@Injectable({providedIn: 'root'})
export class StatsSharingService {
  constructor(private supabase: SupabaseService) {}

  async listAvailableUsers(): Promise<StatsShareableUser[]> {
    const {data, error} = await this.supabase.client.rpc('list_stats_shareable_users');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      userId: row.user_id,
      displayName: row.display_name || 'Spotify user',
      imageUrl: row.image_url || '',
      requestId: row.request_id || null,
      requestStatus: (row.request_status as StatsAccessStatus) || null
    }));
  }

  async listAccessRequests(): Promise<StatsAccessRequest[]> {
    const {data, error} = await this.supabase.client.rpc('list_stats_access_requests');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      ownerUserId: row.owner_user_id,
      viewerUserId: row.viewer_user_id,
      ownerDisplayName: row.owner_display_name || 'Spotify user',
      ownerImageUrl: row.owner_image_url || '',
      viewerDisplayName: row.viewer_display_name || 'Spotify user',
      viewerImageUrl: row.viewer_image_url || '',
      status: row.status as StatsAccessStatus,
      requestedAt: row.requested_at,
      respondedAt: row.responded_at || null,
      revokedAt: row.revoked_at || null,
      updatedAt: row.updated_at,
      viewerRole: row.viewer_role as 'owner' | 'viewer'
    }));
  }

  async requestAccess(ownerUserId: string): Promise<string> {
    const {data, error} = await this.supabase.client.rpc('request_stats_access', {
      p_owner_user_id: ownerUserId
    });
    if (error) throw error;
    const requestId = String(data || '');
    if (!requestId) throw new Error('The stats access request could not be created.');
    return requestId;
  }

  async createAccessInvite(): Promise<CreatedStatsAccessInvite> {
    const token = this.createClaimToken();
    const {data, error} = await this.supabase.client.rpc('create_stats_access_invite', {
      p_claim_token: token
    });
    if (error) throw error;
    const inviteId = String(data || '');
    if (!inviteId) throw new Error('The stats request link could not be created.');
    return {
      inviteId,
      claimToken: token,
      claimUrl: `${environment.appUrl.replace(/\/$/, '')}/shared-playlists/stats-request/${encodeURIComponent(token)}`
    };
  }

  async claimAccessInvite(token: string): Promise<string> {
    const {data, error} = await this.supabase.client.rpc('claim_stats_access_invite', {
      p_claim_token: token
    });
    if (error) throw error;
    const requestId = String(data || '');
    if (!requestId) throw new Error('The stats access request could not be opened.');
    return requestId;
  }

  async respondToRequest(requestId: string, approve: boolean): Promise<void> {
    const {error} = await this.supabase.client.rpc('answer_stats_access_request', {
      p_request_id: requestId,
      p_decision: approve ? 'approved' : 'declined'
    });
    if (error) throw error;
  }

  async revokeAccess(requestId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('revoke_stats_access', {
      p_request_id: requestId
    });
    if (error) throw error;
  }

  async loadSharedStats(ownerUserId: string, range: string): Promise<SharedStatsSnapshot | null> {
    const {data, error} = await this.supabase.client.rpc('get_shared_stats_snapshot', {
      p_owner_user_id: ownerUserId,
      p_range: range
    });
    if (error) throw error;
    if (!data) return null;

    const rawGenres = Array.isArray(data.topGenres) ? data.topGenres : [];
    const totalWeight = rawGenres.reduce((sum: number, genre: any) => sum + Number(genre.weight || 0), 0);
    const weightsArePercentages = totalWeight <= 100
      && rawGenres.every((genre: any) => Number(genre.weight || 0) <= 100);
    return {
      ownerUserId: data.ownerUserId || ownerUserId,
      ownerDisplayName: data.ownerDisplayName || 'Spotify user',
      ownerImageUrl: data.ownerImageUrl || '',
      snapshotDate: data.snapshotDate,
      topTracks: Array.isArray(data.topTracks) ? data.topTracks : [],
      topArtists: Array.isArray(data.topArtists) ? data.topArtists : [],
      topGenres: rawGenres.map((genre: any) => ({
        name: genre.name,
        count: Number(genre.weight || 0),
        percentage: weightsArePercentages
          ? Number(genre.weight || 0)
          : (totalWeight > 0 ? Math.min(100, Math.round((Number(genre.weight || 0) / totalWeight) * 100)) : 0)
      }))
    };
  }

  subscribeToAccessChanges(onChange: () => void): () => void {
    const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const channel = this.supabase.client
      .channel(`stats-access-updates:${suffix}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stats_access_requests'
      }, () => onChange())
      .subscribe();
    return () => {
      void this.supabase.client.removeChannel(channel);
    };
  }

  private createClaimToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}
