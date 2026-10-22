import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {By} from '@angular/platform-browser';
import {afterEach, describe, expect, it, vi} from 'vitest';
import QRCode from 'qrcode';
import {Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {FriendsService} from '@core/friends/friends.service';
import {V2FriendsController} from './v2-friends.controller';
import {FRIENDS_ROUTES} from './friends.routes';
import {V2FriendsPageComponent} from './v2-friends-page.component';

vi.mock('qrcode', () => ({default: {toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fixture-qr')}}));
const toDataURL = QRCode.toDataURL;
@Component({standalone: true, template: '<h1>Outside Friends</h1>'})
class OutsideComponent {}

const friend = {userId: 'friend-A', displayName: 'Suzkapu', imageUrl: '', connectedAt: '2026-10-11', connectionVersion: 'version-A'};
const request = {requestId: 'request-A', inviterUserId: 'sender', displayName: 'Paulzgi', imageUrl: '', createdAt: '2026-10-11'};
const oldInvitation = {id: 'old-invitation', status: 'pending', createdAt: '2026-10-10'};
const newInvitation = {id: 'new-invitation', status: 'pending', createdAt: '2026-10-11'};
afterEach(() => {vi.clearAllMocks();});

function createBackend() {
  let friends = [friend], requests = [request], invitations = [oldInvitation];
  const backend = {
    listFriends: vi.fn(async () => friends), listRequests: vi.fn(async () => requests), listInvitations: vi.fn(async () => invitations),
    createClaimToken: vi.fn(() => 'a'.repeat(64)),
    createInvitation: vi.fn(async (_token: string) => {invitations = [...invitations, newInvitation]; return newInvitation;}),
    receiveInvitation: vi.fn(async () => ({id: request.requestId, inviterUserId: request.inviterUserId, displayName: request.displayName, imageUrl: ''})),
    respondToRequest: vi.fn(async (_id: string, accept: boolean) => {
      requests = [];
      return {id: request.requestId, status: accept ? 'accepted' : 'declined', isConnected: accept};
    }),
    removeFriend: vi.fn(async () => {friends = [];}),
    revokeInvitation: vi.fn(async (id: string) => {invitations = invitations.filter(item => item.id !== id);})
  };
  return backend;
}
async function setup(path = '/friends', configure?: (backend: ReturnType<typeof createBackend>) => void) {
  const backend = createBackend();
  configure?.(backend);
  const clipboard = {writeText: vi.fn().mockResolvedValue(undefined)};
  const auth = {sessionExiting: () => false, logout$: new Subject<void>(), getSupabaseUserId: vi.fn(() => 'actor-A'), getUserId: vi.fn(() => 'spotify-A'), hasCloudIdentity: () => true};
  Object.defineProperty(navigator, 'clipboard', {value: clipboard, configurable: true});
  TestBed.configureTestingModule({providers: [
    provideRouter([{path: 'friends', children: FRIENDS_ROUTES},
      {path: 'friends-default', component: V2FriendsPageComponent, providers: [V2FriendsController]},
      {path: 'outside', component: OutsideComponent}]),
    {provide: SpotifyAuthService, useValue: auth},
    {provide: FriendsService, useValue: backend}
  ]});
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(path);
  const element = () => harness.routeNativeElement as HTMLElement;
  const settle = async () => {harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();};
  await settle();
  const component = () => harness.routeDebugElement!.query(By.directive(V2FriendsPageComponent)).componentInstance as V2FriendsPageComponent;
  return {harness, backend, clipboard, auth, element, settle, component};
}
function button(element: HTMLElement, label: string): HTMLButtonElement {
  const result = [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label);
  expect(result, label + ' button').toBeDefined(); return result!;
}

describe('Mounted canonical Friends workflows', () => {
  it('uses the Friends workflow when embedded without optional route view metadata', async () => {
    const {element, backend} = await setup('/friends-default');
    expect(element().querySelector('h1')?.textContent).toBe('Your friends');
    expect(element().textContent).toContain('Suzkapu');
    expect(backend.createInvitation).not.toHaveBeenCalled();
    expect(backend.receiveInvitation).not.toHaveBeenCalled();
  });
  it('joins repeated preparation while an initial read is pending without creating duplicate invitations', async () => {
    let finish!: (value: typeof request[]) => void;
    const {component, backend, settle, harness} = await setup('/friends/add', backend => {
      backend.listRequests.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    });
    await component().prepare(); await component().prepare();
    expect(backend.listRequests).toHaveBeenCalledOnce();
    expect(backend.createInvitation).not.toHaveBeenCalled();
    finish([request]); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(backend.createInvitation).toHaveBeenCalledOnce();});
  });
  it('does not open or submit removal while an authoritative refresh is pending', async () => {
    const {component, backend, element, settle} = await setup();
    let finish!: (value: typeof friend[]) => void;
    backend.listFriends.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const refresh = component().controller.reload(); await settle();
    component().requestRemoval(friend); await component().confirmRemoval(); await settle();
    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(backend.removeFriend).not.toHaveBeenCalled();
    finish([friend]); await refresh; await settle();
    component().requestRemoval(friend); await settle();
    expect(element().querySelector('[role="dialog"]')?.textContent).toContain('Remove Suzkapu?');
  });
  it('does not prepare or render a replacement invitation after leaving during its creation', async () => {
    const {component, backend, element, harness, settle} = await setup('/friends/add', backend => {
      backend.createInvitation.mockResolvedValueOnce({...newInvitation, status: 'accepted'});
    });
    let finish!: (value: typeof newInvitation) => void;
    backend.createInvitation.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const original = component();
    button(element(), 'Create new invitation').click();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await harness.navigateByUrl('/outside');
    finish(newInvitation); await settle();
    expect(original.qr()).toBe('');
    expect(vi.mocked(toDataURL)).not.toHaveBeenCalled();
    expect(backend.createInvitation).toHaveBeenCalledTimes(2);
    expect(harness.routeNativeElement?.textContent).toContain('Outside Friends');
    await original.prepare();
    expect(backend.createInvitation).toHaveBeenCalledTimes(2);
  });
  it('does not publish a late QR failure after leaving the feature', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(toDataURL).mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject;}));
    const {harness, component, settle} = await setup('/friends/add');
    const original = component();
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    await harness.navigateByUrl('/outside');
    fail(new Error('late QR renderer failure')); await settle();
    expect(original.localFailure()).toBeNull();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
  });
  it('clears a revoked review after refresh without receiving again and keeps Friends usable', async () => {
    const {backend, element, component, settle, harness} = await setup('/friends/invite/' + 'b'.repeat(64));
    backend.listRequests.mockResolvedValue([]);
    await component().controller.reload(); await settle();
    expect(element().textContent).toContain('This invitation is unavailable');
    expect(element().textContent).not.toContain('Paulzgi wants to be your friend');
    expect(backend.receiveInvitation).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));
    await harness.navigateByUrl('/friends'); await settle();
    expect(element().querySelector('[role="alert"]')).toBeNull();
    element().querySelector<HTMLButtonElement>('[aria-label="Manage friend Suzkapu"]')!.click(); await settle();
    button(element(), 'Remove friend').click(); await settle();
    button(element().querySelector<HTMLElement>('[role="dialog"]')!, 'Remove friend').click(); await settle();
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-A');
  });
  it('hides local QR/copy feedback on logout and rejects a late QR completion while still mounted', async () => {
    let finish!: (image: string) => void;
    vi.mocked(toDataURL).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const {auth, element, component, settle} = await setup('/friends/add');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    auth.logout$.next(); await settle();
    expect(element().textContent).toContain('Confirm your Spotify account');
    expect(element().querySelector('.invitation-url, .qr-slot img')).toBeNull();
    expect(component().controller.createdInvitation()).toBeNull();
    finish('data:image/png;base64,old-account'); await settle();
    expect(component().qr()).toBe('');
    expect(element().querySelector('.invitation-url, .qr-slot img')).toBeNull();
  });
  it('does not silently create a second invitation when a creation retry was already consumed', async () => {
    const {backend, element, settle, harness} = await setup('/friends/add', service => {
      service.createInvitation.mockResolvedValueOnce({...newInvitation, status: 'accepted'});
    });
    expect(backend.createInvitation).toHaveBeenCalledOnce();
    expect(element().querySelector('.invitation-url')).toBeNull();
    expect(element().textContent).toContain('Your invitation is no longer active');
    expect(vi.mocked(toDataURL)).not.toHaveBeenCalled();
    backend.createClaimToken.mockReturnValue('b'.repeat(64));
    const create = button(element(), 'Create new invitation');
    create.click(); create.click(); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    expect(backend.createInvitation).toHaveBeenCalledTimes(2);
    expect(backend.createInvitation.mock.calls.map(call => call[0])).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(element().textContent).not.toContain('Your invitation is no longer active');
    create.click(); await settle();
    expect(backend.createInvitation).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])('shows a confirmed recipient decision and returns to Friends (accept=%s)', async accept => {
    const {backend, element, settle} = await setup('/friends/invite/' + 'b'.repeat(64));
    button(element(), accept ? 'Accept' : 'Decline').click(); await settle();
    expect(element().textContent).toContain(accept ? 'Friend request accepted' : 'Friend request declined');
    expect(element().textContent).not.toContain('Paulzgi wants to be your friend');
    expect(element().querySelector('[role="status"]')).not.toBeNull();
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', accept);
    button(element(), 'View friends').click(); await settle();
    expect(element().querySelector('h1')?.textContent).toBe('Your friends');
    expect(backend.respondToRequest).toHaveBeenCalledOnce();
  });
  it('retries only the failed refresh after a confirmed decision before showing its outcome', async () => {
    const {backend, element, settle} = await setup('/friends/invite/' + 'b'.repeat(64));
    backend.listFriends.mockRejectedValueOnce(new Error('refresh unavailable'));
    button(element(), 'Decline').click(); await settle();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(element().textContent).not.toContain('Friend request declined');
    button(element(), 'Retry').click(); await settle();
    expect(element().textContent).toContain('Friend request declined');
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', false);
  });
  it('receives the current review link again for a replacement account without reusing its previous decision', async () => {
    const {backend, auth, element, settle, component, harness} = await setup('/friends/invite/' + 'b'.repeat(64));
    button(element(), 'Decline').click(); await settle();
    expect(element().textContent).toContain('Friend request declined');
    backend.listRequests.mockResolvedValue([request]);
    auth.getSupabaseUserId.mockReturnValue('actor-B'); auth.getUserId.mockReturnValue('spotify-B');
    await component().controller.reload(); await settle();
    expect(element().textContent).not.toContain('Friend request declined');
    await vi.waitFor(() => {harness.detectChanges(); expect(backend.receiveInvitation).toHaveBeenCalledTimes(2);});
    expect(element().textContent).toContain('Paulzgi wants to be your friend');
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', false);
  });
  it('replaces the QR together with its confirmed link after an account change', async () => {
    let finish!: (image: string) => void;
    vi.mocked(toDataURL).mockImplementationOnce(async () => 'data:image/png;base64,actor-A')
      .mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const {auth, backend, element, harness, settle, component} = await setup('/friends/add');
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,actor-A');});
    backend.createClaimToken.mockReturnValue('b'.repeat(64));
    auth.getSupabaseUserId.mockReturnValue('actor-B');
    auth.getUserId.mockReturnValue('spotify-B');
    await component().controller.reload(); await settle();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(element().querySelector('.invitation-url')?.textContent).toContain('b'.repeat(64));
    expect(element().querySelector('.qr-slot img')).toBeNull();
    finish('data:image/png;base64,actor-B'); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,actor-B');});
    expect(vi.mocked(toDataURL).mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('a'.repeat(64)), expect.stringContaining('b'.repeat(64))
    ]);
  });
  it('renders requests and friends, accepts the named request and refreshes the inventory', async () => {
    const {element, backend, settle} = await setup();
    expect(element().querySelector('h1')?.textContent).toBe('Your friends');
    expect(element().textContent).toContain('Friend request from Paulzgi');
    expect(element().textContent).toContain('Friendship does not grant access');
    button(element(), 'Accept').click(); await settle();
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', true);
    expect(element().textContent).not.toContain('Friend request from Paulzgi');
    expect(element().textContent).toContain('Suzkapu');
  });

  it('declines without invoking any friend removal', async () => {
    const {element, backend, settle} = await setup();
    button(element(), 'Decline').click(); await settle();
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', false);
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });

  it('shows the named removal confirmation with Cancel last; cancellation has no data effect', async () => {
    const {element, backend, settle} = await setup();
    element().querySelector<HTMLButtonElement>('[aria-label="Manage friend Suzkapu"]')!.click(); await settle();
    button(element(), 'Remove friend').click(); await settle();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Remove Suzkapu?');
    expect([...dialog.querySelectorAll('button')].map(item => item.textContent?.trim())).toEqual(['Remove friend', 'Cancel']);
    button(dialog, 'Cancel').click(); await settle();
    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });

  it('removes only the confirmed connection version', async () => {
    const {element, backend, settle} = await setup();
    element().querySelector<HTMLButtonElement>('[aria-label="Manage friend Suzkapu"]')!.click(); await settle();
    button(element(), 'Remove friend').click(); await settle();
    button(element().querySelector<HTMLElement>('[role="dialog"]')!, 'Remove friend').click(); await settle();
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-A');
    expect(element().textContent).toContain('Your friends will appear here.');
  });

  it('explains an earlier-session link and revokes it only after confirmation without removing friends', async () => {
    const {element, backend, settle} = await setup('/friends/invitations');
    expect(button(element(), 'View link & QR').disabled).toBe(true);
    expect(element().textContent).toContain('Link unavailable in this session');
    button(element(), 'Revoke').click(); await settle();
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
    button(element().querySelector<HTMLElement>('[role="dialog"]')!, 'Revoke invitation').click(); await settle();
    expect(backend.revokeInvitation).toHaveBeenCalledExactlyOnceWith('old-invitation');
    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(element().textContent).not.toContain('Your friend invitation');
    expect(backend.removeFriend).not.toHaveBeenCalled();
    expect(element().textContent).toContain('Revoking an invitation does not remove existing friends.');
  });

  it('opens the canonical invitation-revoke confirmation without writing, with Cancel last and initially focused', async () => {
    const {element, backend, settle} = await setup('/friends/invitations');
    button(element(), 'Revoke').click(); await settle();
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Revoke friend invitation?');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent)
      .toBe('Disables this invitation’s private link and QR code. Existing friendships are unchanged.');
    expect([...dialog.querySelectorAll('button')].map(item => item.textContent?.trim())).toEqual(['Revoke invitation', 'Cancel']);
    await vi.waitFor(() => expect(document.activeElement).toBe(button(dialog, 'Cancel')));
  });

  it.each(['Cancel', 'Escape'])('cancels invitation revocation with %s without writing and returns focus to its trigger', async action => {
    const {element, backend, settle} = await setup('/friends/invitations');
    const trigger = button(element(), 'Revoke'); trigger.focus(); trigger.click(); await settle();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    if (action === 'Cancel') button(dialog, 'Cancel').click();
    else document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    await settle();
    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
    expect(backend.removeFriend).not.toHaveBeenCalled();
    expect(element().textContent).toContain('Your friend invitation');
    expect(document.activeElement).toBe(trigger);
  });

  it('coalesces rapid invitation-revoke confirmations while the write is pending', async () => {
    let finish!: () => void;
    const {element, backend, settle} = await setup('/friends/invitations', backend => {
      const revoke = backend.revokeInvitation.getMockImplementation()!;
      backend.revokeInvitation.mockImplementationOnce(async id => {
        await new Promise<void>(resolve => {finish = resolve;}); await revoke(id);
      });
    });
    button(element(), 'Revoke').click(); await settle();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const confirm = button(dialog, 'Revoke invitation'); confirm.click(); confirm.click();
    await vi.waitFor(() => expect(backend.revokeInvitation).toHaveBeenCalledExactlyOnceWith('old-invitation'));
    // The still-visible invitation cannot start another operation while its confirmation is in flight.
    button(element(), 'Revoke').click();
    expect(backend.revokeInvitation).toHaveBeenCalledOnce();
    finish(); await settle();
    expect(backend.revokeInvitation).toHaveBeenCalledOnce();
    expect(element().textContent).not.toContain('Your friend invitation');
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });

  it('retries an uncertain confirmed revocation using the same invitation without removing friends', async () => {
    const {element, backend, settle} = await setup('/friends/invitations', backend => {
      backend.revokeInvitation.mockRejectedValueOnce(new Error('connection interrupted'));
    });
    button(element(), 'Revoke').click(); await settle();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    button(dialog, 'Revoke invitation').click(); await settle();
    expect(backend.revokeInvitation).toHaveBeenCalledExactlyOnceWith('old-invitation');
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');
    expect(element().textContent).toContain('Your friend invitation');
    expect(button(element(), 'Revoke').disabled).toBe(true);
    button(element(), 'Retry').click(); await settle();
    expect(backend.revokeInvitation.mock.calls).toEqual([['old-invitation'], ['old-invitation']]);
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().textContent).not.toContain('Your friend invitation');
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });

  it('creates a real single-use URL and reuses its token across tabs instead of creating another invitation', async () => {
    const {element, backend, clipboard, harness, settle, component} = await setup('/friends/add');
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    const originalImage = element().querySelector('.qr-slot img')?.getAttribute('src');
    await component().prepare(); await settle();
    expect(vi.mocked(toDataURL)).toHaveBeenCalledOnce();
    expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe(originalImage);
    button(element(), 'Copy link').click(); await settle();
    const url = new URL(clipboard.writeText.mock.calls[0][0]);
    expect(url.pathname).toContain('/friends/invite/' + 'a'.repeat(64));
    expect(url.href).not.toContain('demo-lukas500');
    expect(vi.mocked(toDataURL)).toHaveBeenCalledWith(url.href, {width: 176, margin: 4, errorCorrectionLevel: 'M'});
    await harness.navigateByUrl('/friends/invitations'); await settle();
    expect(element().querySelector<HTMLAnchorElement>('a[href="/friends/add"]')).not.toBeNull();
    await harness.navigateByUrl('/friends/add'); await settle();
    expect(backend.createInvitation).toHaveBeenCalledExactlyOnceWith('a'.repeat(64));
    expect(element().textContent).toContain(url.href);
  });

  it('retries a failed clipboard operation without minting another token', async () => {
    const {element, backend, clipboard, harness, settle} = await setup('/friends/add');
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    clipboard.writeText.mockRejectedValueOnce(new Error('clipboard permission denied'));
    button(element(), 'Copy link').click(); await settle();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');
    button(element(), 'Retry').click(); await settle();
    expect(clipboard.writeText.mock.calls[1][0]).toBe(clipboard.writeText.mock.calls[0][0]);
    expect(backend.createInvitation).toHaveBeenCalledOnce();
    expect(element().querySelector('[role="alert"]')).toBeNull();
  });

  it('recovers failed QR generation using the original confirmed invitation', async () => {
    vi.mocked(toDataURL).mockRejectedValueOnce(new Error('QR generation failed'));
    const {element, backend, harness, settle} = await setup('/friends/add');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(element().querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');
    });
    expect(element().querySelector('.qr-slot img')).toBeNull();
    const originalUrl = vi.mocked(toDataURL).mock.calls[0][0];
    button(element(), 'Retry').click(); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    expect(vi.mocked(toDataURL).mock.calls.map(call => call[0])).toEqual([originalUrl, originalUrl]);
    expect(backend.createInvitation).toHaveBeenCalledExactlyOnceWith('a'.repeat(64));
    expect(element().querySelector('[role="alert"]')).toBeNull();
  });

  it('coalesces rapid Retry clicks while QR recovery is pending', async () => {
    let finish!: (image: string) => void;
    vi.mocked(toDataURL).mockRejectedValueOnce(new Error('QR failed'))
      .mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const {element, harness, settle} = await setup('/friends/add');
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('[role="alert"]')).not.toBeNull();});
    const retry = button(element(), 'Retry'); retry.click(); retry.click();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(vi.mocked(toDataURL)).toHaveBeenCalledTimes(2);
    finish('data:image/png;base64,recovered'); await settle();
    expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,recovered');
  });

  it('ignores a QR completion after leaving the feature', async () => {
    let finish!: (image: string) => void;
    vi.mocked(toDataURL).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const {harness, component, settle} = await setup('/friends/add');
    const original = component();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await harness.navigateByUrl('/outside'); finish('data:image/png;base64,old-secret'); await settle();
    expect(original.qr()).toBe('');
    expect(harness.routeNativeElement?.textContent).toContain('Outside Friends');
  });

  it('coalesces rapid Copy clicks and ignores its failure after departure', async () => {
    const {element, clipboard, harness, component, settle} = await setup('/friends/add');
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    let fail!: (error: Error) => void;
    clipboard.writeText.mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject;}));
    const original = component(), copy = button(element(), 'Copy link'); copy.click(); copy.click();
    expect(clipboard.writeText).toHaveBeenCalledOnce();
    await harness.navigateByUrl('/outside'); fail(new Error('late clipboard refusal')); await settle();
    expect(original.localFailure()).toBeNull();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not remove a refreshed connection using an already-open confirmation', async () => {
    const {element, backend, harness, settle} = await setup();
    element().querySelector<HTMLButtonElement>('[aria-label="Manage friend Suzkapu"]')!.click(); await settle();
    button(element(), 'Remove friend').click(); await settle();
    const controller = harness.routeDebugElement!.injector.get(V2FriendsController);
    backend.listFriends.mockResolvedValueOnce([{...friend, connectionVersion: 'version-B'}]);
    await controller.reload(); await settle();
    button(element().querySelector<HTMLElement>('[role="dialog"]')!, 'Remove friend').click(); await settle();
    expect(backend.removeFriend).not.toHaveBeenCalled();
    expect(element().textContent).toContain('Suzkapu');
    expect(controller.inventory()?.friends[0].connectionVersion).toBe('version-B');
  });

  it('reserves an incoming invitation for review without automatically accepting it', async () => {
    const token = 'b'.repeat(64);
    const {element, backend, settle} = await setup('/friends/invite/' + token);
    expect(element().textContent).toContain('Paulzgi wants to be your friend');
    expect(backend.receiveInvitation).toHaveBeenCalledExactlyOnceWith(token);
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    button(element(), 'Decline').click(); await settle();
    expect(backend.respondToRequest).toHaveBeenCalledExactlyOnceWith('request-A', false);
  });

  it('shows the received invitation after retrying an uncertain receive failure', async () => {
    const token = 'b'.repeat(64);
    const {element, backend, settle} = await setup('/friends/invite/' + token, backend => {
      backend.receiveInvitation.mockRejectedValueOnce(new Error('connection interrupted'));
    });
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');
    button(element(), 'Retry').click(); await settle();
    expect(backend.receiveInvitation).toHaveBeenCalledTimes(2);
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    expect(element().textContent).toContain('Paulzgi wants to be your friend');
    expect(button(element(), 'Accept').disabled).toBe(false);
  });

  it('discards the previous link preview when route parameters change during receive', async () => {
    const tokenA = 'b'.repeat(64), tokenB = 'c'.repeat(64);
    const previewA = {id: 'request-A', inviterUserId: 'sender-A', displayName: 'Sender A', imageUrl: ''};
    let finish!: (value: typeof previewA) => void;
    const {element, backend, harness, settle} = await setup('/friends/invite/' + tokenA, backend => {
      backend.listRequests.mockResolvedValue([
        {...request, requestId: 'request-A'}, {...request, requestId: 'request-B'}
      ]);
      backend.receiveInvitation.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}))
        .mockResolvedValueOnce({...previewA, id: 'request-B', displayName: 'Sender B'});
    });
    expect(element().textContent).not.toContain('Sender A wants to be your friend');
    await harness.navigateByUrl('/friends/invite/' + tokenB); await settle();
    finish(previewA); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(element().textContent).toContain('Sender B wants to be your friend');});
    expect(element().textContent).not.toContain('Sender A wants to be your friend');
    expect(backend.receiveInvitation).toHaveBeenNthCalledWith(1, tokenA);
    expect(backend.receiveInvitation).toHaveBeenNthCalledWith(2, tokenB);
    expect(backend.respondToRequest).not.toHaveBeenCalled();
  });

  it('recovers an initial inventory failure before creating an invitation', async () => {
    const {element, backend, settle, harness} = await setup('/friends/add', backend => {
      backend.listRequests.mockRejectedValueOnce(new Error('read failed'));
    });
    expect(element().textContent).toContain('Friends could not be loaded');
    expect(backend.createInvitation).not.toHaveBeenCalled();
    button(element(), 'Retry').click(); await settle();
    await vi.waitFor(() => {harness.detectChanges(); expect(element().querySelector('.qr-slot img')).not.toBeNull();});
    expect(backend.createInvitation).toHaveBeenCalledOnce();
  });

  it('replaces a broken friend avatar with the initial without losing its menu', async () => {
    const {element, settle} = await setup('/friends', backend => {
      backend.listFriends.mockResolvedValue([{...friend, imageUrl: 'https://invalid.example/avatar.png'}]);
    });
    element().querySelector('.avatar img')!.dispatchEvent(new Event('error')); await settle();
    expect(element().querySelector('.avatar img')).toBeNull();
    expect(element().querySelector('.avatar')?.textContent?.trim()).toBe('S');
    expect(element().querySelector('[aria-label="Manage friend Suzkapu"]')).not.toBeNull();
  });

  it('destroys invitation secrets and route state when leaving the Friends feature', async () => {
    const {harness, settle} = await setup('/friends/add');
    const controller = harness.routeDebugElement!.injector.get(V2FriendsController);
    await vi.waitFor(() => expect(controller.createdInvitation()).not.toBeNull());
    await harness.navigateByUrl('/outside'); await settle();
    expect(controller.createdInvitation()).toBeNull();
    expect(controller.inventory()).toBeNull();
  });
});
