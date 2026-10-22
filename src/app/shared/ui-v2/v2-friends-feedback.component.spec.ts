import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {FriendsFeedbackState, V2FriendsFeedbackComponent} from './v2-friends-feedback.component';

function render(state: FriendsFeedbackState) {
  const fixture = TestBed.createComponent(V2FriendsFeedbackComponent);
  fixture.componentRef.setInput('state', state);
  const retry = vi.fn();
  fixture.componentInstance.retry.subscribe(retry);
  fixture.detectChanges();
  return {fixture, retry, element: fixture.nativeElement as HTMLElement};
}

describe('Friends recovery announcements and actions', () => {
  it.each(['owner-unavailable', 'accepted', 'declined'] as const)('announces %s politely with only its explicit next action', state => {
    const {fixture, element, retry} = render(state);
    const create = vi.fn(), view = vi.fn();
    fixture.componentInstance.createInvitation.subscribe(create);
    fixture.componentInstance.viewFriends.subscribe(view);
    expect(element.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"], [aria-busy]')).toBeNull();
    const actions = element.querySelectorAll<HTMLButtonElement>('button');
    expect(actions).toHaveLength(1);
    expect(actions[0].textContent?.trim()).toBe(state === 'owner-unavailable' ? 'Create new invitation' : 'View friends');
    actions[0].click();
    expect(create).toHaveBeenCalledTimes(state === 'owner-unavailable' ? 1 : 0);
    expect(view).toHaveBeenCalledTimes(state === 'owner-unavailable' ? 0 : 1);
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled();
  });
  it('explains an earlier-session link politely without offering an impossible retry', () => {
    const {fixture, element, retry} = render('link-unavailable');
    expect(element.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
    expect(element.querySelector('button, [aria-busy], [role="alert"]')).toBeNull();
    expect(element.textContent).toContain('revoke it and create a new invitation');
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled();
  });
  it.each(['loading', 'refreshing', 'busy'] as const)('announces %s politely without offering duplicate actions', state => {
    const {fixture, element, retry} = render(state);
    expect(element.querySelector('[role="status"][aria-live="polite"][aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).toContain(state === 'loading' ? 'Loading friends…'
      : state === 'refreshing' ? 'Your current friends stay visible' : 'Other request actions are temporarily unavailable');
    fixture.componentInstance.requestRetry();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each(['load-error', 'change-error'] as const)('offers one explicit retry for %s and rejects captured stale actions', state => {
    const {fixture, element, retry} = render(state);
    expect(element.querySelector('[role="alert"][aria-live="assertive"]')).not.toBeNull();
    expect(element.querySelector('[aria-busy]')).toBeNull();
    const button = element.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent?.trim()).toBe('Retry');
    fixture.componentInstance.retry.subscribe(() => fixture.componentRef.setInput('state', 'busy'));
    button.click(); button.click();
    expect(retry).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(element.querySelector('button, [role="alert"]')).toBeNull();
  });

  it('describes a mutation timeout as unconfirmed rather than promising a rollback', () => {
    const {element} = render('change-error');
    expect(element.textContent).toContain('Your change could not be confirmed');
    expect(element.textContent).toContain('Retry the same request to confirm the result');
    expect(element.textContent).toContain('does not share listening data');
    expect(element.textContent).not.toContain('rolled back');
  });

  it.each(['unavailable', 'profile-required'] as const)('explains %s without exposing an invalid retry', state => {
    const {fixture, element, retry} = render(state);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('button, [aria-busy]')).toBeNull();
    expect(element.textContent).toContain(state === 'unavailable' ? 'Ask your friend for a new invitation' : 'Connect your verified Spotify account');
    fixture.componentInstance.requestRetry();
    expect(retry).not.toHaveBeenCalled();
  });

  it('removes a retry when the account becomes unavailable, including captured handlers', () => {
    const {fixture, element, retry} = render('load-error');
    const button = element.querySelector<HTMLButtonElement>('button')!;
    fixture.componentRef.setInput('state', 'profile-required');
    button.click();
    fixture.detectChanges();
    expect(retry).not.toHaveBeenCalled();
    expect(element.querySelector('button')).toBeNull();
  });
});
