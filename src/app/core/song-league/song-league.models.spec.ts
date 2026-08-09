import {calculateSongLeaguePoints} from './song-league.models';

describe('Song League scoring', () => {
  it('turns a full Top 100 position into one descending point per rank', () => {
    expect(calculateSongLeaguePoints(100, 1)).toBe(100);
    expect(calculateSongLeaguePoints(100, 35)).toBe(66);
    expect(calculateSongLeaguePoints(100, 100)).toBe(1);
  });

  it('uses the actual list size so sparse profiles have a lower maximum', () => {
    expect(calculateSongLeaguePoints(37, 1)).toBe(37);
    expect(calculateSongLeaguePoints(37, 37)).toBe(1);
    expect(calculateSongLeaguePoints(37, 38)).toBe(0);
  });

  it('awards zero when the recording is absent or the list is empty', () => {
    expect(calculateSongLeaguePoints(100, null)).toBe(0);
    expect(calculateSongLeaguePoints(0, 1)).toBe(0);
  });
});
