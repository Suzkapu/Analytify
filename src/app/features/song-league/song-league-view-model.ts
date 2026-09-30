import {SongLeagueScoreBreakdown} from '@core/song-league/song-league.models';

export interface RecommendationParticipation {
  ranked: number;
  total: number;
  label: string;
}

export function recommendationParticipation(
  rows: readonly SongLeagueScoreBreakdown[],
  eligibleMembers: number
): RecommendationParticipation {
  const total = Math.max(0, eligibleMembers);
  const ranked = Math.min(total, rows.filter(row => row.latestRank !== null).length);
  return {ranked, total, label: `${ranked} of ${total} members ranked this`};
}

export function rankingLabel(row: Pick<SongLeagueScoreBreakdown, 'latestRank' | 'latestPoints'>): string {
  return row.latestRank === null ? '—' : `#${row.latestRank} · +${row.latestPoints}`;
}

export function weeklyTaskCopy(options: {
  isClosed: boolean;
  isDemo: boolean;
  isPickOpen: boolean;
  alreadySubmitted: boolean;
}): {eyebrow: string; title: string; description: string; action: string | null} {
  if (options.isClosed) {
    return {eyebrow: 'League closed', title: 'Weekly Picks are finished', description: 'Past standings and recommendations remain available.', action: null};
  }
  if (options.isPickOpen) {
    return {
      eyebrow: 'Your task',
      title: options.isDemo ? 'Choose a demo discovery' : 'Choose this week’s discovery',
      description: 'Search Spotify or paste a track link, then lock in one pick.',
      action: 'Open Weekly Picks'
    };
  }
  if (options.alreadySubmitted) {
    return {eyebrow: 'This week', title: 'Your pick is locked in', description: 'Scoring updates as members’ Top Songs change.', action: null};
  }
  return {eyebrow: 'Next task', title: 'Weekly Picks open Friday', description: 'Come back Friday to choose one discovery.', action: null};
}
