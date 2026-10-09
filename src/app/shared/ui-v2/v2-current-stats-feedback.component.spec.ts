import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {CurrentStatsFeedbackState, V2CurrentStatsFeedbackComponent} from './v2-current-stats-feedback.component';

function setup(state: CurrentStatsFeedbackState, shared = false) {
  const fixture = TestBed.createComponent(V2CurrentStatsFeedbackComponent);
  fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('shared', shared);
  const retry = vi.fn(); fixture.componentInstance.retry.subscribe(retry); fixture.detectChanges();
  return {fixture, element: fixture.nativeElement as HTMLElement, retry};
}

describe('Current Stats feedback and read-only recovery', () => {
  it.each([false, true])('announces initial loading with decorative skeletons, shared=%s', shared => {
    const {fixture, element, retry} = setup('loading', shared);
    expect(element.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
    expect(element.textContent).toContain(shared ? 'Loading shared Spotify insights…' : 'Loading your Spotify insights…');
    expect(element.textContent).toContain(shared ? 'This read-only snapshot will appear when the range is ready.' : 'Your rankings will appear when this range is ready.');
    expect(element.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(element.querySelector('.skeletons')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('assets/design-v2/stats-current-progress.svg');
    expect(element.querySelector('img')?.getAttribute('alt')).toBe('');
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled();
    expect(element.querySelector('button,[role="alert"]')).toBeNull(); fixture.destroy();
  });

  it.each(['tracks', 'artists', 'genres'] as const)('announces genuine empty %s without failure or retry', category => {
    const {fixture, element, retry} = setup('empty');
    fixture.componentRef.setInput('category', category); fixture.detectChanges();
    expect(element.querySelector('h3')?.textContent).toBe(category === 'tracks' ? 'No top songs found' : category === 'artists' ? 'No top artists found' : 'No genre data found');
    expect(element.textContent).toContain('Try another search, category or ranking period.');
    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"],button,[aria-busy]')).toBeNull();
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled(); fixture.destroy();
  });

  it.each([false, true])('offers only same-range retrieval Retry on failure, shared=%s', shared => {
    const {fixture, element, retry} = setup('unavailable', shared);
    expect(element.querySelector('[role="alert"]')?.getAttribute('aria-live')).toBe('assertive');
    expect(element.querySelector('h3')?.textContent).toBe(shared ? 'Shared stats unavailable' : 'Spotify insights unavailable');
    expect([...element.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Retry']);
    expect(element.textContent).toContain(shared ? 'This range is unavailable. Retry or choose another ranking period.' : 'We couldn’t load this range. Retry to request it again.');
    fixture.componentInstance.retry.subscribe(() => fixture.componentRef.setInput('state', 'loading'));
    const captured = element.querySelector<HTMLButtonElement>('button')!; captured.click(); captured.click();
    expect(retry).toHaveBeenCalledOnce(); fixture.detectChanges();
    expect(element.querySelector('button,[role="alert"]')).toBeNull(); fixture.destroy();
  });

  it('keeps cached refresh feedback non-blocking and offers recovery only after failure', () => {
    const {fixture, element, retry} = setup('refreshing');
    expect(element.textContent).toContain('Refreshing this range… Your cached rankings stay visible.');
    expect(element.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector('.skeletons,button')).toBeNull();
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled();
    fixture.componentRef.setInput('state', 'refresh-failed'); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).toContain('Could not refresh this range');
    expect(element.textContent).toContain('Your cached rankings are still visible. Retry to update them.');
    element.querySelector<HTMLButtonElement>('button')!.click(); expect(retry).toHaveBeenCalledOnce(); fixture.destroy();
  });

  it('renders the authorized service error as text and clears it on a replacement state', () => {
    const {fixture, element} = setup('unavailable', true);
    fixture.componentRef.setInput('message', '<img src=x onerror=alert(1)> Access revoked.'); fixture.detectChanges();
    expect(element.textContent).toContain('<img src=x onerror=alert(1)> Access revoked.');
    expect(element.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('message', ''); fixture.componentRef.setInput('state', 'loading'); fixture.detectChanges();
    expect(element.textContent).not.toContain('Access revoked'); fixture.destroy();
  });
});
