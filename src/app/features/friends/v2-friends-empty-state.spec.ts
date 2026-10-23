import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {Subject} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {Friend, FriendInvitation, FriendRequest, FriendsService} from '@core/friends/friends.service';
import {FRIENDS_ROUTES} from './friends.routes';

vi.mock('qrcode', () => ({default: {toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,empty-state-fixture')}}));

// Canonical desktop194:12384/mobile194:12537: one heading, no body,
// and an explicit navigation CTA to the real Add friend workflow.
const EMPTY_HEADING = 'Your friends will appear here.';
const EMPTY_ACTION = 'Add your first friend';
const request: FriendRequest = {requestId: 'request-empty', inviterUserId: 'sender', displayName: 'Pending Person', imageUrl: '', createdAt: '2026-10-23T00:00:00Z'};
const invitation: FriendInvitation = {id: 'independent-invitation', status: 'pending', createdAt: '2026-10-22T00:00:00Z', respondedAt: null};
const friend: Friend = {userId: 'sender', displayName: 'Pending Person', imageUrl: '', connectedAt: '2026-10-23T00:00:00Z', connectionVersion: 'connection-empty'};

async function setup(options: {requests?: FriendRequest[]; invitations?: FriendInvitation[]} = {}) {
  let friends: Friend[] = [];
  let requests = options.requests || [];
  let invitations = options.invitations || [];
  const backend = {
    listFriends: vi.fn(async () => friends),
    listRequests: vi.fn(async () => requests),
    listInvitations: vi.fn(async () => invitations),
    createClaimToken: vi.fn(() => 'a'.repeat(64)),
    createInvitation: vi.fn(async (_token: string) => {
      const created: FriendInvitation = {id: 'explicit-invitation', status: 'pending', createdAt: '2026-10-23T00:00:00Z', respondedAt: null};
      invitations = [...invitations, created];
      return created;
    }),
    receiveInvitation: vi.fn(),
    respondToRequest: vi.fn(async (id: string, accept: boolean) => {
      requests = requests.filter(item => item.requestId !== id);
      if (accept) friends = [friend];
      return {id, status: accept ? 'accepted' : 'declined', isConnected: accept};
    }),
    revokeInvitation: vi.fn(), removeFriend: vi.fn()
  };
  TestBed.configureTestingModule({providers: [
    provideRouter([{path: 'friends', children: FRIENDS_ROUTES}]),
    {provide: SpotifyAuthService, useValue: {sessionExiting: () => false, logout$: new Subject<void>(),
      getSupabaseUserId: () => 'empty-actor', getUserId: () => 'empty-spotify', hasCloudIdentity: () => true}},
    {provide: FriendsService, useValue: backend}
  ]});
  const harness = await RouterTestingHarness.create('/friends');
  const element = () => harness.routeNativeElement as HTMLElement;
  const settle = async () => {harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();};
  await settle();
  return {harness, element, settle, backend, router: TestBed.inject(Router)};
}

function link(element: HTMLElement, label: string): HTMLAnchorElement {
  const matches = [...element.querySelectorAll<HTMLAnchorElement>('a')].filter(item => item.textContent?.trim() === label);
  expect(matches, `${label} navigation link`).toHaveLength(1);
  return matches[0];
}

function button(element: HTMLElement, label: string): HTMLButtonElement {
  const matches = [...element.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent?.trim() === label);
  expect(matches, `${label} button`).toHaveLength(1);
  return matches[0];
}

afterEach(() => vi.clearAllMocks());

describe('Canonical Friends empty state through mounted routes', () => {
  it('uses the canonical heading and one keyboard-focusable Add first friend navigation action', async () => {
    const h = await setup();
    expect([...h.element().querySelectorAll('h2')].map(item => item.textContent?.trim())).toContain(EMPTY_HEADING);
    const action = link(h.element(), EMPTY_ACTION);
    expect(action.getAttribute('href')).toBe('/friends/add');
    expect(action.getAttribute('aria-hidden')).not.toBe('true');
    expect(action.getAttribute('aria-disabled')).not.toBe('true');
    expect(action.tabIndex).toBe(0);
    action.focus();
    expect(document.activeElement).toBe(action);
    expect(h.element().querySelector('.invitation-url, .qr-slot img')).toBeNull();
    expect(h.backend.createClaimToken).not.toHaveBeenCalled();
    expect(h.backend.createInvitation).not.toHaveBeenCalled();
    expect(h.backend.receiveInvitation).not.toHaveBeenCalled();
  });

  it('opens the actual Add route and creates an invitation only after the explicit empty action', async () => {
    const h = await setup();
    expect(h.backend.createInvitation).not.toHaveBeenCalled();
    link(h.element(), EMPTY_ACTION).click();
    await h.settle();
    expect(h.router.url).toBe('/friends/add');
    expect(h.element().querySelector('h1')?.textContent?.trim()).toBe('Add a friend');
    expect(h.backend.createClaimToken).toHaveBeenCalledTimes(1);
    expect(h.backend.createInvitation).toHaveBeenCalledExactlyOnceWith('a'.repeat(64));
    await vi.waitFor(() => {
      h.harness.detectChanges();
      expect(h.element().querySelector('img[alt="Scan to open this single-person friend invitation"]')).not.toBeNull();
    });
    expect(h.element().querySelector('.invitation-url')?.textContent).toContain('/friends/invite/' + 'a'.repeat(64));
    expect(h.element().textContent).not.toContain(EMPTY_ACTION);
    expect(h.backend.receiveInvitation).not.toHaveBeenCalled();
  });

  it('keeps incoming request decisions available when there are no connected friends', async () => {
    const h = await setup({requests: [request]});
    const pending = h.element().querySelector<HTMLElement>('[aria-label="Friend request from Pending Person"]');
    expect(pending).not.toBeNull();
    expect(button(pending!, 'Accept').disabled).toBe(false);
    expect(button(pending!, 'Decline').disabled).toBe(false);
    expect(h.element().textContent).toContain(EMPTY_HEADING);
    expect(h.backend.respondToRequest).not.toHaveBeenCalled();
    expect(h.backend.createInvitation).not.toHaveBeenCalled();
  });

  it('keeps independent pending invitations reachable without silently replacing them', async () => {
    const h = await setup({invitations: [invitation]});
    expect(h.element().textContent).toContain(EMPTY_HEADING);
    link(h.element(), 'Invitations').click();
    await h.settle();
    expect(h.router.url).toBe('/friends/invitations');
    expect(h.element().textContent).toContain('Your friend invitation');
    expect(h.element().textContent).toContain('Link + QR · One person · Pending');
    expect(button(h.element(), 'Revoke').disabled).toBe(false);
    expect(h.element().textContent).not.toContain(EMPTY_HEADING);
    expect(h.element().textContent).not.toContain(EMPTY_ACTION);
    expect(h.backend.createClaimToken).not.toHaveBeenCalled();
    expect(h.backend.createInvitation).not.toHaveBeenCalled();
    expect(h.backend.revokeInvitation).not.toHaveBeenCalled();
  });

  it.each([true, false])('updates the empty state after an explicit incoming request decision (accept=%s)', async accept => {
    const h = await setup({requests: [request], invitations: [invitation]});
    button(h.element(), accept ? 'Accept' : 'Decline').click();
    await h.settle();
    expect(h.backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-empty', accept);
    expect(h.element().querySelector('[aria-label="Friend request from Pending Person"]')).toBeNull();
    if (accept) {
      expect(h.element().textContent).not.toContain(EMPTY_HEADING);
      expect(h.element().textContent).not.toContain(EMPTY_ACTION);
      expect(h.element().querySelector('h2')?.textContent).toBe('Pending Person');
    } else {
      expect(h.element().textContent).toContain(EMPTY_HEADING);
      expect(link(h.element(), EMPTY_ACTION).getAttribute('href')).toBe('/friends/add');
    }
    expect(h.backend.createInvitation).not.toHaveBeenCalled();
    link(h.element(), 'Invitations').click();
    await h.settle();
    expect(button(h.element(), 'Revoke').disabled).toBe(false);
    expect(h.backend.revokeInvitation).not.toHaveBeenCalled();
  });
});
