export interface GenreRanking {
  name: string;
  rank: number;
  percentage: number;
  prevPercentage: number;
  hasCompare: boolean;
  trendType: string;
  rankDiff: number;
}

/** Service data may be incomplete; never let malformed shares overflow the chart. */
export function genreShare(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** All visible bars and saved comparison bars use the same labelled percentage axis. */
export function genreChartScale(genres: readonly GenreRanking[]): number {
  let maximum = 0;
  for (const genre of genres) {
    maximum = Math.max(maximum, genreShare(genre.percentage));
    if (genre.hasCompare) maximum = Math.max(maximum, genreShare(genre.prevPercentage));
  }
  return Math.max(5, Math.ceil(maximum / 5) * 5);
}

export function genreComparisonCaption(genre: GenreRanking): string {
  if (!genre.hasCompare) return '';
  if (genre.trendType === 'new') return 'New';
  const movement = genre.trendType === 'up' || genre.trendType === 'down'
    ? `${genre.trendType === 'up' ? '↑' : '↓'} ${genre.rankDiff} ${genre.rankDiff === 1 ? 'place' : 'places'}`
    : 'Unchanged';
  const difference = genreShare(genre.percentage) - genreShare(genre.prevPercentage);
  // Keep fractional percentage-point changes readable without floating-point noise.
  const rounded = Math.round(difference * 100) / 100;
  return `${movement} · ${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)} pp`;
}
