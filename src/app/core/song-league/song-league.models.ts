export interface SongLeague {
  id: string;
  ownerUserId: string;
  name: string;
  timezone: string;
  ownerDisplayName: string;
  ownerImageUrl: string;
  playlistRevision: number;
  isDemo: boolean;
  createdAt: string;
}

export interface SongLeagueMember {
  leagueId: string;
  userId: string;
  role: 'owner' | 'member';
  displayName: string;
  imageUrl: string;
  joinedAt: string;
}

export interface SongLeagueStanding extends SongLeagueMember {
  totalPoints: number;
  lastSevenDaysPoints: number;
}

export interface SongLeagueRecommendation {
  id: string;
  leagueId: string;
  roundId: string;
  recommenderUserId: string;
  trackId: string;
  recordingKey: string;
  isrc: string | null;
  trackName: string;
  artistNames: string;
  albumName: string;
  imageUrl: string;
  spotifyUrl: string;
  submittedAt: string;
  scoringStartsAt: string;
  scoringEndsAt: string;
}

export interface SongLeaguePlaylist {
  leagueId: string;
  userId: string;
  spotifyPlaylistId: string | null;
  spotifyPlaylistUrl: string;
  lastSyncedRevision: number;
  lastSyncedRoundId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SongLeagueScoreBreakdown {
  recommendationId: string;
  trackId: string;
  trackName: string;
  artistNames: string;
  imageUrl: string;
  spotifyUrl: string;
  submittedAt: string;
  scoringStartsAt: string;
  scoringEndsAt: string;
  listenerUserId: string;
  listenerDisplayName: string;
  totalPoints: number;
  latestRank: number | null;
  latestListSize: number | null;
  latestPoints: number;
  latestSnapshotDate: string | null;
}

export interface SongLeagueDashboard {
  league: SongLeague;
  members: SongLeagueMember[];
  standings: SongLeagueStanding[];
  recommendations: SongLeagueRecommendation[];
  playlists: SongLeaguePlaylist[];
  breakdownByRecommender: Map<string, SongLeagueScoreBreakdown[]>;
}

export interface CreatedSongLeague {
  leagueId: string;
  inviteToken: string;
  inviteUrl: string;
}

export interface SongLeagueTrack {
  id: string;
  name: string;
  artists: Array<{id: string; name: string}>;
  album: {
    id: string;
    name: string;
    images: Array<{url: string}>;
  };
  external_ids?: {isrc?: string};
  external_urls?: {spotify?: string};
  uri?: string;
  duration_ms?: number;
  explicit?: boolean;
  is_local?: boolean;
  is_playable?: boolean;
}

export function calculateSongLeaguePoints(listSize: number, rank: number | null): number {
  const safeSize = Math.max(0, Math.min(100, Math.trunc(listSize || 0)));
  if (rank === null || !Number.isFinite(rank)) return 0;
  const safeRank = Math.trunc(rank);
  if (safeRank < 1 || safeRank > safeSize) return 0;
  return safeSize - safeRank + 1;
}
