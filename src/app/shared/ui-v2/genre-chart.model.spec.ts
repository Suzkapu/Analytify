import {describe, expect, it} from 'vitest';
import {GenreRanking, genreChartScale, genreComparisonCaption, genreShare} from './genre-chart.model';

const genre = (overrides: Partial<GenreRanking> = {}): GenreRanking => ({
  name: 'Dream Pop', rank: 2, percentage: 24, prevPercentage: 18,
  hasCompare: false, trendType: 'same', rankDiff: 0, ...overrides
});

describe('genre chart percentage contract', () => {
  it('uses a labelled scale that includes current and available comparison shares', () => {
    expect(genreChartScale([])).toBe(5);
    expect(genreChartScale([genre()])).toBe(25);
    expect(genreChartScale([genre({percentage: 25})])).toBe(25);
    expect(genreChartScale([genre({percentage: 25.1})])).toBe(30);
    expect(genreChartScale([genre({prevPercentage: 40})])).toBe(25);
    expect(genreChartScale([genre({prevPercentage: 40, hasCompare: true})])).toBe(40);
    expect(genreChartScale([genre({percentage: 1}), genre({percentage: 71})])).toBe(75);
  });

  it('contains corrupted service values without overflowing the axis or inventing a share', () => {
    expect([NaN, Infinity, -Infinity, -5, 0, .5, 100, 120].map(genreShare)).toEqual([0, 0, 0, 0, 0, .5, 100, 100]);
    expect(genreChartScale([genre({percentage: NaN, prevPercentage: Infinity, hasCompare: true})])).toBe(5);
    expect(genreChartScale([genre({percentage: 120})])).toBe(100);
  });

  it('describes rank movement separately from percentage-point change and removes absent comparisons', () => {
    expect(genreComparisonCaption(genre())).toBe('');
    expect(genreComparisonCaption(genre({hasCompare: true, trendType: 'new'}))).toBe('New');
    expect(genreComparisonCaption(genre({hasCompare: true, trendType: 'up', rankDiff: 1}))).toBe('↑ 1 place · +6 pp');
    expect(genreComparisonCaption(genre({hasCompare: true, trendType: 'up', rankDiff: 3, percentage: 12}))).toBe('↑ 3 places · −6 pp');
    expect(genreComparisonCaption(genre({hasCompare: true, trendType: 'down', rankDiff: 1, percentage: 12}))).toBe('↓ 1 place · −6 pp');
    expect(genreComparisonCaption(genre({hasCompare: true, trendType: 'down', rankDiff: 2}))).toBe('↓ 2 places · +6 pp');
    expect(genreComparisonCaption(genre({hasCompare: true, prevPercentage: 24}))).toBe('Unchanged · 0 pp');
    expect(genreComparisonCaption(genre({hasCompare: true, percentage: .3, prevPercentage: .1}))).toBe('Unchanged · +0.2 pp');
  });
});
