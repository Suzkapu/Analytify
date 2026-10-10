import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from './design-v2-shell.component';
import {AmbientBackgroundComponent} from '@shared/ambient/ambient-background.component';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

@Component({standalone: true, template: '<h1>Playlists</h1>'})
class PlaylistsStubComponent {}

@Component({standalone: true, template: '<h1>Stats</h1>'})
class StatsStubComponent {}

describe('DesignV2ShellComponent', () => {
  async function createShell() {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    return {harness, shell};
  }

  it('refuses cloud deletion when the cloud identity is unavailable', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue(null);
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.requestClearData(); shell.selectClearData('cloud');
    await shell.confirmCloudClear();
    expect(deletion).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(shell.clearDataStep()).toBe('cloud');
    expect(shell.actionError()).toBe('You must be signed in to delete cloud data.');
  });

  it('deletes only the current cloud identity before logout and navigation', async () => {
    const {shell} = await createShell();
    const sequence: string[] = [];
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('current-user');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockImplementation(async () => {sequence.push('delete');});
    vi.spyOn(shell.authService, 'logout').mockImplementation(async () => {sequence.push('logout');});
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async () => {sequence.push('navigate'); return true;});
    shell.requestClearData(); shell.selectClearData('cloud');
    await shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledExactlyOnceWith('current-user');
    expect(sequence).toEqual(['delete', 'logout', 'navigate']);
    expect(shell.clearDataStep()).toBe('none');
  });

  it.each(['spotify', 'cloud', 'generation', 'destroy'])('does not log out or navigate a replacement session after pending cloud deletion (%s)', async replacement => {
    const {shell, harness} = await createShell();
    const spotify = vi.spyOn(shell.authService, 'getUserId').mockReturnValue('actor-a');
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    let finish!: () => void;
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData')
      .mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('cloud');
    const pending = shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledExactlyOnceWith('cloud-a');
    if (replacement === 'spotify') spotify.mockReturnValue('actor-b');
    if (replacement === 'cloud') cloud.mockReturnValue('cloud-b');
    if (replacement === 'generation') await TestBed.inject(SessionLifecycleService).invalidateAndDrain();
    if (replacement === 'destroy') harness.fixture.destroy();
    finish(); await pending;
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(shell.actionError()).toBe('');
  });

  it('does not publish a previous account deletion failure into the replacement account', async () => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    let fail!: (error: Error) => void;
    vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData')
      .mockImplementation(() => new Promise<void>((_, reject) => {fail = reject;}));
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('cloud');
    const pending = shell.confirmCloudClear();
    cloud.mockReturnValue('cloud-b');
    fail(new Error('Account A deletion failed')); await pending;
    expect(logout).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    expect(shell.actionError()).toBe(''); expect(shell.actionRunning()).toBe(false);
  });

  it('still finishes its own logout when logout invalidates the generation and clears identity', async () => {
    const {shell} = await createShell();
    const spotify = vi.spyOn(shell.authService, 'getUserId').mockReturnValue('actor-a');
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    const lifecycle = TestBed.inject(SessionLifecycleService);
    vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    vi.spyOn(shell.authService, 'logout').mockImplementation(async () => {
      shell.authService.logout$.next();
      await lifecycle.invalidateAndDrain();
      spotify.mockReturnValue(null); cloud.mockReturnValue(null);
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('cloud'); await shell.confirmCloudClear();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']);
    expect(shell.clearDataStep()).toBe('none'); expect(shell.actionRunning()).toBe(false);
    expect(shell.actionError()).toBe('');
  });

  it('does not navigate a replacement account after the original logout is already pending', async () => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    let finish!: () => void;
    const logout = vi.spyOn(shell.authService, 'logout').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('cloud'); const pending = shell.confirmCloudClear();
    await vi.waitFor(() => expect(logout).toHaveBeenCalledOnce());
    cloud.mockReturnValue('cloud-b'); finish(); await pending;
    expect(navigate).not.toHaveBeenCalled(); expect(shell.actionError()).toBe('');
    expect(shell.actionRunning()).toBe(false);
  });

  it.each(['success', 'failure', 'replacement'])('uses the real profile deletion adapter with an isolated database boundary (%s)', async outcome => {
    let complete!: (result: {error: Error | null}) => void;
    const eq = vi.fn(() => new Promise<{error: Error | null}>(resolve => {complete = resolve;}));
    const remove = vi.fn(() => ({eq}));
    const from = vi.fn(() => ({delete: remove}));
    const client = {from, rpc: async () => ({data: false, error: null})};
    vi.spyOn(TestBed.inject(SupabaseService), 'getClient')
      .mockResolvedValue(client as unknown as Awaited<ReturnType<SupabaseService['getClient']>>);
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('isolated-cloud-a');
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('cloud'); const pending = shell.confirmCloudClear();
    await vi.waitFor(() => expect(eq).toHaveBeenCalledExactlyOnceWith('id', 'isolated-cloud-a'));
    expect(from).toHaveBeenCalledExactlyOnceWith('users'); expect(remove).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    if (outcome === 'replacement') cloud.mockReturnValue('isolated-cloud-b');
    complete({error: outcome === 'failure' ? new Error('Isolated deletion denied') : null}); await pending;
    if (outcome === 'success') {
      expect(logout).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']);
      expect(shell.clearDataStep()).toBe('none'); expect(shell.actionError()).toBe('');
    } else {
      expect(logout).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
      expect(shell.actionError()).toBe(outcome === 'failure'
        ? 'This action did not finish. Some steps may already have completed. Please refresh before trying again.' : '');
    }
    expect(shell.actionRunning()).toBe(false);
  });

  it.each(['resolve', 'reject'])('keeps a replacement account usable after a pending direct logout %s', async outcome => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    let finish!: () => void, fail!: (error: Error) => void;
    vi.spyOn(shell.authService, 'logout').mockImplementation(() => new Promise<void>((resolve, reject) => {finish = resolve; fail = reject;}));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pending = shell.requestLogout(); cloud.mockReturnValue('cloud-b');
    if (outcome === 'resolve') finish(); else fail(new Error('Previous logout failed'));
    await pending;
    expect(navigate).not.toHaveBeenCalled(); expect(shell.accountOpen()).toBe(false);
    expect(shell.actionError()).toBe(''); expect(shell.actionRunning()).toBe(false);
  });

  it.each((['local', 'cloud', 'guest'] as const).flatMap(kind =>
    ['spotify', 'cloud', 'generation'].map(replacement => ({kind, replacement}))))('rejects the displayed $kind confirmation after $replacement changes', async ({kind, replacement}) => {
    const {shell, harness} = await createShell();
    const spotify = vi.spyOn(shell.authService, 'getUserId').mockReturnValue('actor-a');
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(kind === 'guest');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const click = (text: string) => {
      const button = [...(harness.fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .find(item => item.textContent?.trim() === text);
      expect(button).toBeDefined(); button!.click(); harness.fixture.detectChanges();
    };
    const open = () => {
      shell.toggleAccount(); harness.fixture.detectChanges();
      click(kind === 'guest' ? 'Log out' : 'Clear data');
      if (kind !== 'guest') {
        const label = kind === 'local' ? 'Clear this browser and log out' : 'Delete cloud data and leave shared features';
        const button = [...(harness.fixture.nativeElement as HTMLElement).querySelectorAll('button')]
          .find(item => item.querySelector('strong')?.textContent === label)!;
        button.click(); harness.fixture.detectChanges();
      }
    };
    const confirm = kind === 'local' ? 'Clear and log out' : kind === 'cloud' ? 'Delete cloud data' : 'Delete and log out';
    // Replace the authorization context only after its confirmation is shown.
      spotify.mockReturnValue('actor-a'); cloud.mockReturnValue('cloud-a'); open();
      expect(shell.clearDataStep()).toBe(kind);
      if (replacement === 'spotify') spotify.mockReturnValue('actor-b');
      if (replacement === 'cloud') cloud.mockReturnValue('cloud-b');
      if (replacement === 'generation') await TestBed.inject(SessionLifecycleService).invalidateAndDrain();
      click(confirm); await harness.fixture.whenStable();
      expect(deletion).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled(); expect(shell.actionRunning()).toBe(false);
      expect(shell.clearDataStep()).toBe('none');
  });

  it.each(['local', 'cloud', 'guest'] as const)('refuses %s data effects when no confirmation was opened', async kind => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    if (kind === 'local') await shell.confirmLocalClear();
    if (kind === 'cloud') await shell.confirmCloudClear();
    if (kind === 'guest') await shell.confirmGuestLogout();
    expect(deletion).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled(); expect(shell.clearDataStep()).toBe('none');
  });

  it.each(['choose', 'local'] as const)('does not recapture a replacement actor while moving from %s', async step => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    shell.requestClearData(); if (step === 'local') shell.selectClearData('local');
    cloud.mockReturnValue('cloud-b'); shell.selectClearData(step === 'choose' ? 'cloud' : 'choose');
    expect(shell.clearDataStep()).toBe('none');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    await shell.confirmCloudClear(); expect(deletion).not.toHaveBeenCalled();
  });

  it('uses fresh consent for the new account after cancellation and reopening', async () => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    shell.requestClearData(); shell.selectClearData('cloud'); shell.closeConfirmation();
    cloud.mockReturnValue('cloud-b'); shell.requestClearData(); shell.selectClearData('cloud');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledExactlyOnceWith('cloud-b'); expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']); expect(shell.clearDataStep()).toBe('none');
  });

  it('executes anonymous logout only after the explicit confirmation', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(true);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await shell.requestLogout();
    expect(logout).not.toHaveBeenCalled();
    await shell.confirmGuestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(shell.clearDataStep()).toBe('none');
  });

  it.each([new Error('Backup unavailable'), 'Unknown rejection'])('preserves backup confirmation after enable failure %s', async error => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'enableBackup').mockRejectedValue(error);
    shell.backupConfirmationOpen.set(true);
    await shell.enableBackup();
    expect(shell.backupConfirmationOpen()).toBe(true);
    expect(shell.actionRunning()).toBe(false);
    expect(shell.actionError()).toBe(error instanceof Error ? error.message : 'Cloud Backup could not be enabled.');
    shell.closeConfirmation();
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(shell.actionError()).toBe('');
  });

  it('falls back to the profile icon when artwork fails', async () => {
    const {harness, shell} = await createShell();
    shell.profilePicUrl.set('https://example.com/missing.jpg');
    shell.profileImageFailed();
    harness.fixture.detectChanges();
    expect(shell.profilePicUrl()).toBeNull();
    expect(harness.fixture.nativeElement.querySelector('.v2-account-button .pi-user')).not.toBeNull();
  });

  it('requires anonymous-account confirmation before logging out', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(true);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.toggleAccount();
    await shell.requestLogout();
    expect(shell.accountOpen()).toBe(false);
    expect(shell.clearDataStep()).toBe('guest');
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out a recoverable account and navigates to login', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.toggleAccount();
    await shell.requestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(shell.accountOpen()).toBe(false);
    expect(shell.actionRunning()).toBe(false);
    expect(shell.actionError()).toBe('');
  });

  it('does not start a second logout while the first is pending', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    let finish!: () => void;
    const logout = vi.spyOn(shell.authService, 'logout').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pending = shell.requestLogout();
    await shell.requestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(shell.actionRunning()).toBe(true);
    finish();
    await pending;
    expect(shell.actionRunning()).toBe(false);
  });

  it.each(['logout', 'navigation', 'cancelled'])('renders an account alert for %s failure', async failure => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    const logout = vi.spyOn(shell.authService, 'logout');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    if (failure === 'logout') logout.mockRejectedValue(new Error('Offline'));
    else logout.mockResolvedValue(undefined);
    if (failure === 'navigation') navigate.mockRejectedValue(new Error('Route failed'));
    else navigate.mockResolvedValue(failure !== 'cancelled');
    await expect(shell.requestLogout()).resolves.toBeUndefined();
    harness.fixture.detectChanges();
    expect(shell.accountOpen()).toBe(true);
    expect(shell.actionRunning()).toBe(false);
    expect(harness.fixture.nativeElement.querySelector('.v2-account-dialog [role="alert"]')?.textContent)
      .toContain('Log out did not finish');
    if (failure === 'logout') expect(navigate).not.toHaveBeenCalled();
  });

  it('restores the authoritative backup switch when enabling is cancelled', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isBackupActive').mockReturnValue(false);
    const input = document.createElement('input');
    input.checked = true;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(input.checked).toBe(false);
    expect(shell.backupConfirmationOpen()).toBe(true);
    shell.closeConfirmation();
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(input.checked).toBe(false);
  });

  it('announces failed backup disable in the account dialog and releases its busy state', async () => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'isBackupActive').mockReturnValue(true);
    const disable = vi.spyOn(shell.authService, 'disableBackup').mockRejectedValue(new Error('Offline'));
    shell.toggleAccount();
    const input = document.createElement('input');
    input.checked = false;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(input.checked).toBe(true);
    expect(shell.actionRunning()).toBe(true);
    input.checked = true;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(disable).toHaveBeenCalledOnce();
    expect(shell.backupConfirmationOpen()).toBe(false);
    await Promise.resolve();
    harness.fixture.detectChanges();
    expect(shell.actionRunning()).toBe(false);
    expect(harness.fixture.nativeElement.querySelector('.v2-account-dialog [role="alert"]')?.textContent)
      .toContain('Cloud Backup could not be disabled');
  });

  it('ignores duplicate enable requests until the first confirmation finishes', async () => {
    const {shell} = await createShell();
    let finish!: () => void;
    const enable = vi.spyOn(shell.authService, 'enableBackup').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    shell.backupConfirmationOpen.set(true);
    const pending = shell.enableBackup();
    await shell.enableBackup();
    expect(enable).toHaveBeenCalledOnce();
    expect(shell.backupConfirmationOpen()).toBe(true);
    finish();
    await pending;
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(shell.actionRunning()).toBe(false);
  });

  it('prevents duplicate deletion and disables Back while an action is pending', async () => {
    const {harness, shell} = await createShell();
    let finish!: () => void;
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.requestClearData(); shell.selectClearData('local');
    const pending = shell.confirmLocalClear();
    await shell.confirmLocalClear();
    shell.requestClearData();
    shell.selectClearData('cloud');
    shell.closeConfirmation();
    harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('local');
    expect(clear).toHaveBeenCalledOnce();
    const back = Array.from(harness.fixture.nativeElement.querySelectorAll('button'))
      .find((node: unknown) => (node as HTMLButtonElement).textContent?.trim() === 'Back') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    finish();
    await pending;
    expect(shell.actionRunning()).toBe(false);
    expect(shell.clearDataStep()).toBe('none');
  });

  it.each(['logout', 'local'] as const)('does not publish obsolete feedback after pending %s navigation', async kind => {
    const {shell} = await createShell();
    const cloud = vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-a');
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    let completeNavigation!: (result: boolean) => void;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate')
      .mockImplementation(() => new Promise<boolean>(resolve => {completeNavigation = resolve;}));
    if (kind === 'local') {shell.requestClearData(); shell.selectClearData('local');}
    const pending = kind === 'local' ? shell.confirmLocalClear() : shell.requestLogout();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']));
    cloud.mockReturnValue('cloud-b');
    completeNavigation(false);
    await pending;
    expect(logout).toHaveBeenCalledTimes(kind === 'logout' ? 1 : 0);
    expect(clear).toHaveBeenCalledTimes(kind === 'local' ? 1 : 0);
    expect(shell.actionError()).toBe('');
    expect(shell.accountOpen()).toBe(false);
    expect(shell.actionRunning()).toBe(false);
    expect(shell.clearDataStep()).toBe(kind === 'local' ? 'local' : 'none');
  });

  it('keeps confirmation and conservative feedback if navigation fails after local clearing', async () => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(false);
    shell.requestClearData(); shell.selectClearData('local');
    await shell.confirmLocalClear();
    harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('local');
    expect(shell.actionError()).toContain('Some steps may already have completed');
    expect(harness.fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Some steps may already have completed');
    expect(shell.actionRunning()).toBe(false);
  });

  it('does not log out if cloud deletion fails', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-user');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockRejectedValue(new Error('Deletion failed'));
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.requestClearData(); shell.selectClearData('cloud');
    await shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledWith('cloud-user');
    expect(logout).not.toHaveBeenCalled();
    expect(shell.clearDataStep()).toBe('cloud');
    expect(shell.actionError()).toContain('This action did not finish');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{
        path: '',
        component: DesignV2ShellComponent,
        children: [
          {
            path: 'playlists', component: PlaylistsStubComponent, title: 'Playlists | Analytify',
            data: designV2RouteData('playlists', 'Your Playlists', 'wide', 'library', {preload: true})
          },
          {
            path: 'stats', component: StatsStubComponent, title: 'Stats | Analytify',
            data: designV2RouteData('stats', 'Your Stats', 'full', 'insights', {preload: true})
          },
          {
            path: 'login', component: PlaylistsStubComponent, title: 'Sign in | Analytify',
            data: designV2RouteData('login', 'Sign in', 'form', 'account', {chromeMode: 'focus'})
          }
        ]
      }])]
    });
  });

  it('keeps one shell instance mounted while child routes change', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const first = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;
    const firstAmbient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance;
    expect(firstAmbient.state.routeKey()).toBe('library');

    await harness.navigateByUrl('/stats');
    const second = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;
    const secondAmbient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance;

    expect(second).toBe(first);
    expect(secondAmbient).toBe(firstAmbient);
    expect(secondAmbient.state.routeKey()).toBe('insights');
    expect(second.pageContext()).toEqual(expect.objectContaining({
      pageId: 'stats', title: 'Your Stats', width: 'full', ambientKey: 'insights'
    }));
  });

  it('hands focus to the new route after an open tools dialog releases its inert background', async () => {
    const {harness, shell} = await createShell();
    shell.toggleTools();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const main = harness.fixture.nativeElement.querySelector('main') as HTMLElement;
    const focusedWhileInert: boolean[] = [];
    const focus = vi.spyOn(main, 'focus').mockImplementation(() => {
      focusedWhileInert.push(Boolean(main.inert || main.closest('[inert], [aria-hidden="true"]')));
    });
    await harness.navigateByUrl('/stats');
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(shell.toolsOpen()).toBe(false);
    expect(harness.fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(focusedWhileInert).toEqual([false]);
  });

  it('renders desktop and mobile navigation from the same model with semantic active state', async () => {
    const harness = await RouterTestingHarness.create('/stats');
    harness.fixture.detectChanges();
    const element = harness.fixture.nativeElement as HTMLElement;
    const desktop = Array.from(element.querySelectorAll<HTMLElement>('.v2-desktop-nav .v2-nav-link'));
    const mobile = Array.from(element.querySelectorAll<HTMLElement>('.v2-mobile-nav__link'));

    expect(desktop.map(link => link.textContent?.trim())).toEqual(['Playlists', 'Stats', 'History']);
    expect(mobile.map(link => link.textContent?.trim())).toEqual(['Playlists', 'Stats', 'History']);
    expect(desktop.find(link => link.textContent?.includes('Stats'))?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('main')?.getAttribute('aria-label')).toBe('Your Stats content');
  });

  it('owns one accessible overlay host and closes the workspace with Escape', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    shell.toggleTools();
    harness.fixture.detectChanges();

    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.v2-overlay-host').length).toBe(1);
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    const ambient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance as AmbientBackgroundComponent;
    expect(ambient.state.overlayState()).toBe('tools');

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    harness.fixture.detectChanges();
    expect(shell.toolsOpen()).toBe(false);
    expect(ambient.state.overlayState()).toBe('none');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the ambient instance through menu navigation and shell-mode changes', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    const ambient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance as AmbientBackgroundComponent;
    shell.toggleTools();
    harness.fixture.detectChanges();
    expect(ambient.state.overlayState()).toBe('tools');

    await harness.navigateByUrl('/stats');
    expect(harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance).toBe(ambient);
    expect(ambient.state.overlayState()).toBe('none');
    await harness.navigateByUrl('/login');
    expect(harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance).toBe(ambient);
    expect(ambient.state.shellMode()).toBe('focus');
  });

  it('opens the account hub with a usable profile fallback and all account actions', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    shell.profilePicUrl.set(null);
    shell.toggleAccount();
    harness.fixture.detectChanges();

    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-account-avatar .pi-user')).not.toBeNull();
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Cloud Backup');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Notifications');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Manage Spotify access');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Clear data');
    const decorativeIcons = element.querySelectorAll('.v2-account-dialog .pi');
    expect(decorativeIcons.length).toBeGreaterThan(0);
    expect([...decorativeIcons].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('uses minimal chrome for focus routes', async () => {
    const harness = await RouterTestingHarness.create('/login');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-desktop-nav')).toBeNull();
    expect(element.querySelector('.v2-mobile-nav')).toBeNull();
    expect(element.querySelector('.v2-tools-button')).toBeNull();
    expect(element.querySelector('.v2-account-button')).toBeNull();
    expect(element.querySelector('.v2-brand')).not.toBeNull();
  });

  it('uses More consistently and preserves Spotify attribution', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-tools-button')?.textContent?.trim()).toBe('More');
    expect(element.textContent).not.toContain('Workspace');
    expect(element.querySelector('.v2-footer')?.textContent).toContain('Powered by Spotify');
    expect(element.querySelector('.v2-footer')?.textContent).toContain('Legal & privacy');
  });

  it.each([false, true])('keeps retained account settings and excludes blocked-user management (cloud identity %s)', async hasCloudIdentity => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'hasCloudIdentity').mockReturnValue(hasCloudIdentity);
    shell.toggleAccount();
    harness.fixture.detectChanges();
    const dialog = harness.fixture.nativeElement.querySelector('.v2-account-dialog') as HTMLElement;
    const buttons = [...dialog.querySelectorAll('button')].map(button => button.textContent?.trim());
    expect(buttons).toContain('Notifications');
    expect(buttons).toContain('Log out');
    expect(buttons).toContain('Clear data');
    expect(buttons.includes('Automatic updates')).toBe(hasCloudIdentity);
    expect(buttons).not.toContain('Blocked users');
    expect(dialog.querySelector('input[role="switch"]')).not.toBeNull();
    expect(dialog.querySelector('a[href="https://www.spotify.com/account/apps/"]')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(dialog.querySelector('a[href="/legal#privacy"]')).not.toBeNull();
  });

  it.each(['Notifications', 'Automatic updates'])('opens the retained %s action from the rendered menu without a data mutation', async label => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'hasCloudIdentity').mockReturnValue(true);
    const open = vi.spyOn(shell.overlays, 'open').mockResolvedValue(null);
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.toggleAccount();
    harness.fixture.detectChanges();
    const button = [...(harness.fixture.nativeElement as HTMLElement).querySelectorAll('.v2-account-dialog button')]
      .find(item => item.textContent?.trim() === label) as HTMLButtonElement;
    button.click();
    await harness.fixture.whenStable();
    expect(open).toHaveBeenCalledOnce();
    const factory = open.mock.calls[0][0];
    const component = await factory();
    const expected = label === 'Notifications'
      ? (await import('../header/notification-settings-dialog.component')).NotificationSettingsDialogComponent
      : (await import('../header/sync-task-status-dialog.component')).SyncTaskStatusDialogComponent;
    expect(component).toBe(expected);
    expect(shell.accountOpen()).toBe(false);
    expect(deletion).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('routes settings through the shared overlay service', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    const open = vi.spyOn(shell.overlays, 'open').mockResolvedValue(null);

    await shell.openNotifications();
    await shell.openAutomaticUpdates();

    expect(open).toHaveBeenCalledTimes(2);
    expect(shell.accountOpen()).toBe(false);
  });

  it('requires confirmation before enabling backup and clearing local data', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    const enable = vi.spyOn(shell.authService, 'enableBackup').mockResolvedValue(undefined);
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    shell.requestBackupChange({target: {checked: true}} as unknown as Event);
    expect(shell.backupConfirmationOpen()).toBe(true);
    expect(enable).not.toHaveBeenCalled();
    await shell.enableBackup();
    expect(enable).toHaveBeenCalledOnce();

    shell.requestClearData(); shell.selectClearData('local');
    await shell.confirmLocalClear();
    expect(clear).toHaveBeenCalledOnce();
    expect(shell.clearDataStep()).toBe('none');
  });

  it('provides a skip link and one main landmark', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-skip-link')?.getAttribute('href')).toBe('#v2-main-content');
    expect(element.querySelectorAll('main').length).toBe(1);
  });

  it('applies the route width as the only page-width decision', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const main = harness.fixture.nativeElement.querySelector('main') as HTMLElement;
    expect(main.classList).toContain('v2-main--wide');
    expect(main.className).not.toContain('standard');
  });
});
