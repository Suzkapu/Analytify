import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter, Router, RouterOutlet} from '@angular/router';
import {Subject} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {Friend, FriendInvitation, FriendRequest, FriendsService} from '@core/friends/friends.service';
import {FRIENDS_ROUTES} from './friends.routes';
import {V2FriendsPageComponent} from './v2-friends-page.component';

@Component({standalone: true, imports: [RouterOutlet], template: '<button id="other-task">Another task</button><main id="v2-main-content" tabindex="-1"><router-outlet /></main>'})
class FocusHost {}

const request: FriendRequest = {requestId: 'focus-request', inviterUserId: 'sender', displayName: 'Paulzgi', imageUrl: '', createdAt: '2026-10-23'};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function backend() {
  let requests = [request];
  return {
    listFriends: vi.fn(async (): Promise<Friend[]> => []),
    listRequests: vi.fn(async () => requests),
    listInvitations: vi.fn(async (): Promise<FriendInvitation[]> => []),
    removeFriend: vi.fn(async (_userId: string, _version?: string) => {}),
    receiveInvitation: vi.fn(async () => ({id: request.requestId, inviterUserId: request.inviterUserId, displayName: request.displayName, imageUrl: ''})),
    respondToRequest: vi.fn(async (id: string, accept: boolean) => {
      requests = [];
      return {id, status: accept ? 'accepted' : 'declined', isConnected: accept};
    })
  };
}
async function setup(configure?: (service: ReturnType<typeof backend>) => void, review = false) {
  const service = backend(); configure?.(service);
  TestBed.configureTestingModule({imports: [FocusHost], providers: [
    provideRouter([{path: 'friends', children: FRIENDS_ROUTES}]),
    {provide: FriendsService, useValue: service},
    {provide: SpotifyAuthService, useValue: {sessionExiting: () => false, logout$: new Subject<void>(), getSupabaseUserId: () => 'focus-cloud', getUserId: () => 'focus-spotify', hasCloudIdentity: () => true}}
  ]});
  const fixture = TestBed.createComponent(FocusHost);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const other = element.querySelector<HTMLButtonElement>('#other-task')!;
  other.focus();
  await TestBed.inject(Router).navigateByUrl(review ? '/friends/invite/' + 'b'.repeat(64) : '/friends');
  const settle = async () => {fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();};
  await settle();
  const page = fixture.debugElement.query(By.directive(V2FriendsPageComponent)).componentInstance as V2FriendsPageComponent;
  const feedback = () => element.querySelector<HTMLElement>('v2-friends-feedback > section');
  const main = element.querySelector<HTMLElement>('main')!;
  const activate = async (label: string, input: 'keyboard' | 'pointer' | 'click-only' = 'keyboard') => {
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent?.trim() === label);
    expect(buttons, label).toHaveLength(1);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[0].tabIndex).toBe(0);
    buttons[0].focus(); expect(document.activeElement).toBe(buttons[0]);
    // DOM emulators do not synthesize a native click from Enter; dispatch both
    // actual boundaries, while browser tests verify native keyboard activation.
    if (input === 'keyboard') buttons[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    else if (input === 'pointer') buttons[0].dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}));
    buttons[0].click(); await settle();
  };
  return {service, element, other, main, page, settle, feedback, activate};
}

afterEach(() => vi.clearAllMocks());

describe('Mounted Friends action focus ownership (canonical 1008:32348)', () => {
  it('announces initial loading and background refresh without moving existing focus', async () => {
    const initial = deferred<Friend[]>();
    const h = await setup(service => service.listFriends.mockImplementationOnce(() => initial.promise));
    expect(h.feedback()?.textContent).toContain('Loading friends');
    // Reading/clicking ordinary page copy is not an action that may own focus.
    h.element.querySelector<HTMLElement>('h1')!.click();
    expect(document.activeElement).toBe(h.other);
    initial.resolve([]); await h.settle();
    expect(document.activeElement).toBe(h.other);
    const refresh = deferred<Friend[]>();
    h.service.listFriends.mockImplementationOnce(() => refresh.promise);
    const pending = h.page.controller.reload(); await h.settle();
    expect(h.feedback()?.textContent).toContain('Refreshing friends');
    expect(document.activeElement).toBe(h.other);
    refresh.resolve([]); await pending; await h.settle();
    expect(document.activeElement).toBe(h.other);
    expect(h.service.respondToRequest).not.toHaveBeenCalled();
  });

  it.each(['keyboard', 'pointer', 'click-only'] as const)('recovers a removed Retry to pending feedback and then the stable main after successful recovery (%s)', async input => {
    const h = await setup(service => service.listFriends.mockRejectedValueOnce(new Error('offline')));
    const retry = deferred<Friend[]>();
    h.service.listFriends.mockImplementationOnce(() => retry.promise);
    await h.activate('Retry', input);
    const pending = h.feedback()!;
    expect(pending.textContent).toContain('Loading friends');
    expect(pending.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(pending);
    expect(h.element.querySelector('button')?.textContent).not.toBe('Retry');
    retry.resolve([]); await h.settle();
    expect(h.feedback()).toBeNull();
    expect(document.activeElement).toBe(h.main);
    expect(h.service.listFriends).toHaveBeenCalledTimes(2);
    expect(h.service.respondToRequest).not.toHaveBeenCalled();
  });

  it('keeps recovered focus on retained failure feedback with a usable Retry', async () => {
    const h = await setup(service => service.listFriends.mockRejectedValueOnce(new Error('offline')));
    const retry = deferred<Friend[]>();
    h.service.listFriends.mockImplementationOnce(() => retry.promise);
    await h.activate('Retry');
    const pending = h.feedback()!;
    expect(document.activeElement).toBe(pending);
    retry.reject(new Error('still offline')); await h.settle();
    expect(h.feedback()).toBe(pending);
    expect(pending.getAttribute('role')).toBe('alert');
    expect(pending.textContent).toContain('Friends could not be loaded');
    expect(document.activeElement).toBe(pending);
    const retryButton = pending.querySelector('button')!;
    expect(retryButton.disabled).toBe(false);
    expect(retryButton.tabIndex).toBe(0);
    expect(h.service.listFriends).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('does not steal focus moved elsewhere during a pending Retry (failure=%s)', async fails => {
    const h = await setup(service => service.listFriends.mockRejectedValueOnce(new Error('offline')));
    const retry = deferred<Friend[]>();
    h.service.listFriends.mockImplementationOnce(() => retry.promise);
    await h.activate('Retry');
    expect(document.activeElement).toBe(h.feedback());
    h.other.focus(); expect(document.activeElement).toBe(h.other);
    if (fails) retry.reject(new Error('still offline')); else retry.resolve([]);
    await h.settle();
    expect(document.activeElement).toBe(h.other);
    expect(h.service.listFriends).toHaveBeenCalledTimes(2);
  });

  it('relinquishes ownership after the person moves elsewhere even if that control later blurs', async () => {
    const h = await setup(service => service.listFriends.mockRejectedValueOnce(new Error('offline')));
    const retry = deferred<Friend[]>();
    h.service.listFriends.mockImplementationOnce(() => retry.promise);
    await h.activate('Retry');
    expect(document.activeElement).toBe(h.feedback());
    h.other.focus();
    expect(document.activeElement).toBe(h.other);
    h.other.blur();
    expect(document.activeElement).toBe(document.body);
    retry.resolve([]); await h.settle();
    expect(document.activeElement).toBe(document.body);
    expect(h.service.listFriends).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])('keeps focus on the retained confirmed review outcome (accept=%s)', async accept => {
    const h = await setup(undefined, true);
    const decision = deferred<{id: string; status: string; isConnected: boolean}>();
    const original = h.service.respondToRequest.getMockImplementation()!;
    h.service.respondToRequest.mockImplementationOnce(async (id, choice) => {
      await decision.promise;
      return original(id, choice);
    });
    await h.activate(accept ? 'Accept' : 'Decline');
    const pending = h.feedback()!;
    expect(pending.textContent).toContain('Updating your request');
    expect(document.activeElement).toBe(pending);
    decision.resolve({id: request.requestId, status: accept ? 'accepted' : 'declined', isConnected: accept});
    await h.settle();
    expect(h.feedback()).toBe(pending);
    expect(pending.textContent).toContain(accept ? 'Friend request accepted' : 'Friend request declined');
    expect(document.activeElement).toBe(pending);
    expect(pending.getAttribute('role')).toBe('status');
    expect(h.service.respondToRequest).toHaveBeenCalledExactlyOnceWith(request.requestId, accept);
  });

  it.each([false, true])('recovers removed confirmation trigger only while focus remains owned (user moved=%s)', async moved => {
    const friend: Friend = {userId: 'remove-friend', displayName: 'Suzkapu', imageUrl: '', connectedAt: '2026-10-23', connectionVersion: 'remove-version'};
    const removal = deferred<void>();
    const h = await setup(service => {
      service.listFriends.mockResolvedValueOnce([friend]);
      service.removeFriend.mockImplementationOnce(() => removal.promise);
    });
    const manage = h.element.querySelector<HTMLButtonElement>('[aria-label="Manage friend Suzkapu"]')!;
    manage.focus();
    manage.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    manage.click(); await h.settle();
    await h.activate('Remove friend');
    expect(h.element.querySelector('[role="dialog"]')).not.toBeNull();
    await h.activate('Remove friend');
    expect(h.service.removeFriend).toHaveBeenCalledExactlyOnceWith('remove-friend', 'remove-version');
    expect(h.element.querySelector('[role="dialog"]')).toBeNull();
    expect(h.feedback()?.textContent).toContain('Updating your request');
    expect(manage.isConnected).toBe(true);
    expect(document.activeElement, 'dialog returns to the original menu trigger while removal is held').toBe(manage);
    if (moved) {
      h.other.focus();
      expect(document.activeElement).toBe(h.other);
    }
    removal.resolve(); await h.settle();
    expect(manage.isConnected).toBe(false);
    expect(h.element.querySelector('[aria-label="Manage friend Suzkapu"]')).toBeNull();
    expect(document.activeElement).toBe(moved ? h.other : h.main);
  });
});
