import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {AdminPendingReviewDialogComponent} from './admin-pending-review-dialog.component';
import {AdminPendingReviewView} from './admin-pending-review-state';

const base = {userId: 'synthetic-user', displayName: 'Synthetic listener', spotifyId: 'pending:synthetic-profile',
  createdAt: '2026-10-24T08:00:00Z', blockers: [], message: ''};
async function mount(phase: AdminPendingReviewView['phase'], overrides: Partial<AdminPendingReviewView> = {}) {
  await TestBed.configureTestingModule({imports: [AdminPendingReviewDialogComponent]}).compileComponents();
  const fixture = TestBed.createComponent(AdminPendingReviewDialogComponent);
  fixture.componentRef.setInput('view', {...base, phase, ...overrides});
  const events = {confirmed: vi.fn(), retryReview: vi.fn(), reconcile: vi.fn(), dismissed: vi.fn()};
  for (const key of Object.keys(events) as (keyof typeof events)[]) fixture.componentInstance[key].subscribe(events[key]);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
  const button = (label: string) => buttons().find(item => item.textContent?.trim() === label)!;
  return {fixture, root, buttons, button, events};
}

describe('incomplete registration review dialog', () => {
  it.each([
    ['reviewing', ['Cancel']], ['blocked', ['Close']], ['eligible', ['Delete registration', 'Cancel']],
    ['deleting', ['Cancel']], ['review-error', ['Try review again', 'Cancel']],
    ['delete-error', ['Refresh user list', 'Cancel']], ['deleted-read-error', ['Refresh user list', 'Close']],
    ['deleted-refreshing', ['Close']], ['reconciling', ['Cancel']]
  ] as const)('exposes only permitted actions for %s and puts safe dismissal last', async (phase, actions) => {
    const {root, buttons, events} = await mount(phase);
    expect(buttons().map(item => item.textContent?.trim())).toEqual([...actions]);
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('#' + dialog.getAttribute('aria-labelledby'))?.textContent).toBeTruthy();
    expect(root.querySelector('#' + dialog.getAttribute('aria-describedby'))?.textContent).toBeTruthy();
    if (phase !== 'eligible') expect(buttons().some(item => item.textContent?.includes('Delete registration'))).toBe(false);
    expect(events.confirmed).not.toHaveBeenCalled();
    expect(buttons().at(-1)?.hasAttribute('appModalInitialFocus')).toBe(true);
  });

  it('shows each actual blocked review reason once without duplicating the global kept feedback', async () => {
    const blockers = ['Cloud Backup or Spotify credentials are connected.', 'Linked data was found.'];
    const {root} = await mount('blocked', {blockers,
      message: 'This incomplete registration was kept: ' + blockers.join(' ')});
    for (const reason of blockers) expect(root.textContent?.split(reason)).toHaveLength(2);
    expect(root.textContent).not.toContain('This incomplete registration was kept:');
    expect(root.querySelectorAll('.review-details p')).toHaveLength(3);
  });

  it('requests deletion only after the eligible destructive action and never from Cancel', async () => {
    const {button, events} = await mount('eligible');
    button('Cancel').click(); expect(events.dismissed).toHaveBeenCalledOnce(); expect(events.confirmed).not.toHaveBeenCalled();
    button('Delete registration').click(); expect(events.confirmed).toHaveBeenCalledOnce();
  });

  it.each(['deleting', 'deleted-refreshing', 'reconciling'] as const)('cannot dismiss busy phase %s by button or Escape', async phase => {
    const {buttons, events} = await mount(phase);
    expect(buttons().every(item => item.disabled)).toBe(true);
    buttons()[0].click(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(events.dismissed).not.toHaveBeenCalled(); expect(events.confirmed).not.toHaveBeenCalled();
  });

  it('allows Escape while reviewing and keeps keyboard cycling inside its safe controls', async () => {
    const {root, events, button} = await mount('reviewing');
    button('Cancel').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    expect(root.contains(document.activeElement)).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(events.dismissed).toHaveBeenCalledOnce();
  });

  it('retries only review after a failed review, and reconciles uncertain or confirmed deletion without repeating it', async () => {
    const {fixture, button, events, root} = await mount('review-error');
    button('Try review again').click(); expect(events.retryReview).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('view', {...base, phase: 'delete-error', message: 'Connection interrupted.'}); fixture.detectChanges();
    expect(root.textContent).toContain('Deletion not confirmed'); expect(root.textContent).not.toContain('Registration kept');
    button('Refresh user list').click(); expect(events.reconcile).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('view', {...base, phase: 'deleted-read-error'}); fixture.detectChanges();
    expect(root.textContent).toContain('The deletion was confirmed');
    button('Refresh user list').click(); expect(events.reconcile).toHaveBeenCalledTimes(2);
    expect(events.confirmed).not.toHaveBeenCalled();
  });

  it('renders server identity, errors and blockers as inert text and rejects invalid calendar timestamps', async () => {
    const hostile = '<img src=x onerror=alert(1)>' + 'long'.repeat(100);
    const {root, fixture} = await mount('blocked', {spotifyId: hostile, blockers: [hostile], message: hostile, createdAt: '2026-02-30T08:00:00Z'});
    expect(root.textContent).toContain(hostile); expect(root.querySelector('img,script')).toBeNull();
    expect(root.querySelector('time')).toBeNull();
    fixture.componentRef.setInput('view', {...base, phase: 'eligible'}); fixture.detectChanges();
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe(base.createdAt);
    expect(root.querySelector('time')?.textContent).toContain('24 Oct 2026, 08:00');
    expect(root.querySelector('time')?.textContent).toContain('UTC');
  });

  it('adds a keyboard stop only while details overflow and updates it when the viewport grows', async () => {
    const {root, fixture, button} = await mount('blocked', {blockers: ['Linked data '.repeat(200)]});
    const body = root.querySelector<HTMLElement>('.review-body')!;
    let visibleHeight = 120;
    Object.defineProperties(body, {scrollHeight: {get: () => 600}, clientHeight: {get: () => visibleHeight}});
    window.dispatchEvent(new Event('resize')); fixture.detectChanges(); await fixture.whenStable();
    expect(body.getAttribute('role')).toBe('region');
    expect(body.getAttribute('aria-label')).toBe('Registration review details');
    expect(body.tabIndex).toBe(0);
    body.focus(); expect(document.activeElement).toBe(body);
    const pageDown = new KeyboardEvent('keydown', {key: 'PageDown', bubbles: true, cancelable: true});
    body.dispatchEvent(pageDown); expect(pageDown.defaultPrevented).toBe(false);
    button('Close').focus();
    visibleHeight = 800;
    window.dispatchEvent(new Event('resize')); fixture.detectChanges(); await fixture.whenStable();
    expect(body.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(button('Close'));
  });

  it('retains the safe focused control when the review becomes eligible and repairs disabled focus on deletion', async () => {
    const {fixture, root, button} = await mount('reviewing');
    button('Cancel').focus();
    fixture.componentRef.setInput('view', {...base, phase: 'eligible'}); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(button('Cancel'));
    button('Delete registration').focus();
    fixture.componentRef.setInput('view', {...base, phase: 'deleting'}); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('[role="dialog"]'));
  });
});
