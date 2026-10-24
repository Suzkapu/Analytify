import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {Subject} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import QRCode from 'qrcode';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {FriendsService} from '@core/friends/friends.service';
import {FRIENDS_ROUTES} from './friends.routes';
import {V2FriendsPageComponent} from './v2-friends-page.component';

vi.mock('qrcode', () => ({default: {toDataURL: vi.fn()}}));

afterEach(() => {vi.clearAllMocks();});

describe('Mounted Friends clipboard account ownership', () => {
  it('discards an old account clipboard rejection and lets the replacement account copy its own invitation', async () => {
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(async () => 'data:image/png;base64,owner-A')
      .mockImplementationOnce(async () => 'data:image/png;base64,owner-B');
    let owner = 'A';
    const tokens = {A: 'a'.repeat(64), B: 'b'.repeat(64)};
    const auth = {
      sessionExiting: () => false, logout$: new Subject<void>(), hasCloudIdentity: () => true,
      getSupabaseUserId: () => 'actor-' + owner, getUserId: () => 'spotify-' + owner
    };
    const invitations = new Map<string, {id: string; status: string; createdAt: string}>();
    const backend = {
      listFriends: vi.fn(async () => []), listRequests: vi.fn(async () => []),
      listInvitations: vi.fn(async () => invitations.has(owner) ? [invitations.get(owner)!] : []),
      createClaimToken: vi.fn(() => tokens[owner as keyof typeof tokens]),
      createInvitation: vi.fn(async (_token: string) => {
        const invitation = {id: 'invitation-' + owner, status: 'pending', createdAt: '2026-10-24'};
        invitations.set(owner, invitation); return invitation;
      })
    };
    let rejectOld!: (error: Error) => void;
    const clipboard = {writeText: vi.fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectOld = reject;}))
      .mockResolvedValue(undefined)};
    Object.defineProperty(navigator, 'clipboard', {value: clipboard, configurable: true});
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: 'friends', children: FRIENDS_ROUTES}]),
      {provide: SpotifyAuthService, useValue: auth}, {provide: FriendsService, useValue: backend}
    ]});
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/friends/add');
    const element = () => harness.routeNativeElement as HTMLElement;
    const component = harness.routeDebugElement!.query(By.directive(V2FriendsPageComponent)).componentInstance as V2FriendsPageComponent;
    const settle = async () => {harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();};
    const copy = () => [...element().querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === 'Copy link')!;
    await settle();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,owner-A');
    });
    copy().click();
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(tokens.A));

    owner = 'B';
    await component.controller.reload(); await settle();
    expect(component).toBe(harness.routeDebugElement!.query(By.directive(V2FriendsPageComponent)).componentInstance);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(element().querySelector('.invitation-url')?.textContent).toContain(tokens.B);
    });
    expect(element().textContent).not.toContain(tokens.A);
    expect(element().querySelector('.qr-slot img')).toBeNull();
    rejectOld(new Error('Old account clipboard permission denied')); await settle();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,owner-B');
    });
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().textContent).not.toContain(tokens.A);
    expect(copy().disabled).toBe(false);
    copy().click(); await settle();
    expect(clipboard.writeText.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining(tokens.A), expect.stringContaining(tokens.B)
    ]);
    expect(backend.createInvitation.mock.calls.map(call => call[0])).toEqual([tokens.A, tokens.B]);
    expect(vi.mocked(QRCode.toDataURL).mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining(tokens.A), expect.stringContaining(tokens.B)
    ]);
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().querySelector('.qr-slot img')?.getAttribute('src')).toBe('data:image/png;base64,owner-B');
  });
});
