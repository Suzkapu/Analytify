import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {GenreRanking} from './genre-chart.model';
import {V2GenreRankingsComponent} from './v2-genre-rankings.component';

const genres: GenreRanking[] = [
  {name: 'Alternative Rock', rank: 1, percentage: 24, prevPercentage: 18, hasCompare: true, trendType: 'up', rankDiff: 1},
  {name: 'Dream Pop', rank: 2, percentage: 18, prevPercentage: 24, hasCompare: true, trendType: 'down', rankDiff: 1},
  {name: 'Trip Hop', rank: 3, percentage: .5, prevPercentage: 0, hasCompare: true, trendType: 'new', rankDiff: 0}
];

describe('canonical genre rankings', () => {
  it('renders comparable percentages and independent private History actions', () => {
    const fixture = TestBed.createComponent(V2GenreRankingsComponent);
    fixture.componentRef.setInput('genres', genres);
    const history = vi.fn();fixture.componentInstance.historyRequested.subscribe(history);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('.ticks span')].map(t => t.textContent)).toEqual(['0%', '5%', '10%', '15%', '20%', '25%']);
    const rows = element.querySelectorAll<HTMLElement>('.v2-genre-row');
    expect(rows[0].querySelector('strong')?.textContent).toBe('1. Alternative Rock');
    expect(rows[0].querySelector('small')?.textContent).toBe('↑ 1 place · +6 pp');
    expect(rows[0].querySelector<HTMLElement>('.current')?.style.width).toBe('96%');
    expect(rows[0].querySelector<HTMLElement>('.marker')?.style.width).toBe('72%');
    expect(rows[1].querySelector<HTMLElement>('.current')?.style.width).toBe('72%');
    expect(rows[1].querySelector<HTMLElement>('.lost')?.style.width).toBe('96%');
    expect(rows[1].querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Dream Pop: 18%, previously 24%');
    expect(rows[2].querySelector('.share')?.textContent).toBe('<1%');
    expect(rows[2].querySelector('.previous')).toBeNull();
    expect(rows[2].querySelector<HTMLElement>('.current')?.style.width).toBe('2%');
    rows[0].click();expect(history).not.toHaveBeenCalled();
    rows[1].querySelector<HTMLButtonElement>('button')!.click();
    expect(history).toHaveBeenCalledExactlyOnceWith(genres[1]);
    expect(element.querySelector('button button, [role="button"]')).toBeNull();
    fixture.destroy();
  });

  it('keeps the full ranking scale when filtering and removes private controls when access becomes shared', () => {
    const fixture = TestBed.createComponent(V2GenreRankingsComponent);
    fixture.componentRef.setInput('genres', [genres[2]]);
    fixture.componentRef.setInput('scaleGenres', genres);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('strong')?.textContent).toBe('3. Trip Hop');
    expect(element.querySelector<HTMLElement>('.current')?.style.width).toBe('2%');
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('View position history for Trip Hop');
    fixture.componentRef.setInput('historyAvailable', false);
    fixture.detectChanges();
    expect(element.querySelector('button')).toBeNull();
    expect(element.querySelector('.chart')?.classList.contains('shared')).toBe(true);
    expect(element.querySelector('.ticks')?.textContent).toBe('0%5%10%15%20%25%');
    fixture.destroy();
  });

  it('updates the axis and comparison markers when a new range removes old comparison data', () => {
    const fixture = TestBed.createComponent(V2GenreRankingsComponent);
    fixture.componentRef.setInput('genres', genres);
    fixture.detectChanges();
    fixture.componentRef.setInput('genres', [{...genres[0], percentage: 50, hasCompare: false}]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.ticks')?.textContent).toBe('0%10%20%30%40%50%');
    expect(element.querySelector<HTMLElement>('.current')?.style.width).toBe('100%');
    expect(element.querySelector('.previous, small')).toBeNull();
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Alternative Rock: 50%');
    fixture.componentRef.setInput('genres', []);fixture.detectChanges();
    expect(element.querySelector('.v2-genre-row')).toBeNull();
    fixture.destroy();
  });
});
