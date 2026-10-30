import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
import type {Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

const retainedReads = ['get_public_site_settings', 'admin_list_users', 'admin_list_schedule_status',
  'admin_list_required_sync_reasons', 'admin_list_sync_schedule_policy', 'admin_list_sync_runs', 'admin_list_moderation_reports'];

interface AdminIdentityFixture {
  display_name?: string;
  spotify_id?: string;
  backup_active?: boolean;
  has_refresh_token?: boolean;
}

async function setupAdmin(page: Page, isAdmin: boolean, allowPolicyWrite = false, allowUserWrite = false,
  identity: AdminIdentityFixture = {}, pendingFlow = false) {
  const reads: string[] = [], unexpected: string[] = [], runtimeErrors: string[] = [];
  let failRuns = false, failUsers = false;
  const runPlans: {rows: unknown[]; fail?: boolean; wait?: Promise<void>}[] = [];
  const userPlans: {fail: boolean; wait?: Promise<void>; timezone?: string}[] = [];
  const pendingReviews: {response: {eligible: boolean; spotifyId: string; createdAt: string; blockers: string[]}; fail: boolean; wait?: Promise<void>}[] = [];
  const pendingDeletes: {fail: boolean; removeOnFailure: boolean; wait?: Promise<void>}[] = [];
  const reviewCalls: unknown[] = [], deleteCalls: unknown[] = [];
  let pendingProfilePresent = true;
  let policyMinutes = 60;
  let savedTimezone = 'Europe/Vienna';
  const writes: unknown[] = [];
  const policyWrites: unknown[] = [], userWrites: unknown[] = [];
  let releaseWrite: (() => void) | undefined;
  const heldWrite = new Promise<void>(resolve => {releaseWrite = resolve;});
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await mockSpotify(page);
  await page.route('https://api.spotify.com/**', route => {
    if (route.request().method() === 'GET') return route.fallback();
    unexpected.push(`Spotify write ${route.request().method()}`);
    return route.abort('blockedbyclient');
  });
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({json: {id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
    if (path === '/rest/v1/users' && request.method() === 'GET') return route.fulfill({json: null});
    const name = path.split('/').at(-1)!;
    if (name === 'is_app_admin') {reads.push(name); return route.fulfill({json: isAdmin});}
    if (pendingFlow && name === 'admin_review_pending_spotify_profile') {
      const payload = request.postDataJSON(), plan = pendingReviews.shift();
      if (request.method() !== 'POST' || !plan || JSON.stringify(payload) !== JSON.stringify({p_user_id: 'synthetic-user'})) {
        unexpected.push('Unplanned pending registration review'); return route.abort('blockedbyclient');
      }
      reads.push(name); reviewCalls.push(payload); await plan.wait;
      return plan.fail ? route.fulfill({status: 503, json: {message: 'Synthetic review interruption'}}) : route.fulfill({json: plan.response});
    }
    if (pendingFlow && name === 'admin_delete_reviewed_pending_spotify_profile') {
      const payload = request.postDataJSON(), plan = pendingDeletes.shift();
      const expected = {p_user_id: 'synthetic-user', p_expected_spotify_id: 'pending:server-reviewed-synthetic-user'};
      if (request.method() !== 'POST' || !plan || deleteCalls.length !== 0 || JSON.stringify(Object.entries(payload).sort()) !== JSON.stringify(Object.entries(expected).sort())) {
        unexpected.push('Unplanned pending registration deletion'); return route.abort('blockedbyclient');
      }
      writes.push(payload); deleteCalls.push(payload); await plan.wait;
      if (!plan.fail || plan.removeOnFailure) pendingProfilePresent = false;
      return plan.fail ? route.fulfill({status: 503, json: {message: 'Synthetic deletion transport interruption'}}) : route.fulfill({json: null});
    }
    if (name === 'admin_update_sync_user' && allowUserWrite) {
      const payload = request.postDataJSON();
      writes.push(payload); userWrites.push(payload);
      const expected = {p_user_id: 'synthetic-user', p_enabled: true, p_timezone: 'Europe/London',
        p_history_enabled: true, p_history_interval_minutes: 60, p_history_interval_unit: 'minutes',
        p_short_term_enabled: false, p_short_term_interval_hours: 24, p_short_term_interval_unit: 'hours',
        p_medium_term_enabled: false, p_medium_term_interval_hours: 168, p_medium_term_interval_unit: 'hours',
        p_long_term_enabled: false, p_long_term_interval_hours: 168, p_long_term_interval_unit: 'hours',
        p_song_league_playlists_enabled: false, p_song_league_playlist_fridays_only: true,
        p_song_league_playlist_interval_minutes: 60, p_song_league_playlist_interval_unit: 'minutes',
        p_shared_playlists_enabled: false, p_shared_playlist_interval_minutes: 60, p_shared_playlist_interval_unit: 'minutes'};
      if (userWrites.length !== 1 || JSON.stringify(Object.entries(payload).sort()) !== JSON.stringify(Object.entries(expected).sort())) {
        unexpected.push('Unplanned user settings write');
        return route.abort('blockedbyclient');
      }
      await heldWrite;
      savedTimezone = payload.p_timezone;
      return route.fulfill({json: null});
    }
    if (name === 'admin_update_sync_schedule_policy' && allowPolicyWrite) {
      const payload = request.postDataJSON();
      writes.push(payload); policyWrites.push(payload);
      if (policyWrites.length !== 1 || Object.keys(payload).length !== 4 || payload.p_task_key !== 'listening_history' || payload.p_available !== true || payload.p_interval_value !== 2 || payload.p_interval_unit !== 'hours') {
        unexpected.push(`Unplanned policy write ${JSON.stringify(payload)}`);
        return route.abort('blockedbyclient');
      }
      await heldWrite;
      policyMinutes = 120;
      failUsers = true;
      return route.fulfill({json: null});
    }
    if (retainedReads.includes(name)) {
      reads.push(name);
      if (name === 'get_public_site_settings') return route.fulfill({json: [{announcement: '', allow_song_league_creation: false}]});
      if (name === 'admin_list_users') {
        const presentAtRequest = pendingProfilePresent;
        const plan = userPlans.shift();
        let timezone = savedTimezone;
        if (plan) {
          // A held response retains its request-time server snapshot.
          await plan.wait;
          if (plan.fail) return route.fulfill({status: 503, json: {message: 'Synthetic saved user read interruption'}});
          if (plan.timezone) { savedTimezone = plan.timezone; timezone = plan.timezone; }
        }
        if (failUsers) {failUsers = false; return route.fulfill({status: 503, json: {message: 'Synthetic user schedule refresh interruption'}});}
        if (pendingFlow && !presentAtRequest) return route.fulfill({json: []});
        return route.fulfill({json: [{user_id: 'synthetic-user', spotify_id: 'synthetic-listener', display_name: 'Synthetic schedule user', backup_active: true, has_refresh_token: true, enabled: true, history_enabled: true, timezone, ...identity}]});
      }
      if (name === 'admin_list_schedule_status') return route.fulfill({json: [{user_id: 'synthetic-user', next_effective_run_at: '2026-10-24T12:00:00Z'}]});
      if (name === 'admin_list_required_sync_reasons') return route.fulfill({json: []});
      if (name === 'admin_list_sync_schedule_policy') return route.fulfill({json: [{task_key: 'listening_history', available: true, minimum_interval_minutes: policyMinutes}, {task_key: 'stats_short_term', available: true, minimum_interval_minutes: 1440}]});
      if (name === 'admin_list_sync_runs') {
        const plan = runPlans.shift();
        if (plan) {
          await plan.wait;
          return plan.fail ? route.fulfill({status: 503, json: {message: 'Synthetic audit trail interruption'}}) : route.fulfill({json: plan.rows});
        }
        if (failRuns) {failRuns = false; return route.fulfill({status: 503, json: {message: 'Synthetic audit trail interruption'}});}
        return route.fulfill({json: [{id: 'synthetic-run', user_id: 'synthetic-user', display_name: 'Synthetic audit user', task_key: 'listening_history', status: 'failed', trigger_type: 'scheduled', requested_at: '2026-10-24T08:00:00Z', error: 'Synthetic retry pending', details: {warnings: ['Synthetic previous data retained']}}]});
      }
      return route.fulfill({json: [{report_id: 'synthetic-report', receipt_code: 'TEST-ADMIN-RECEIPT', category: 'user_safety', status: 'appealed', reporter_name: 'Synthetic reporter', affected_name: 'Synthetic recipient', reason: 'Synthetic moderation review', appeal_reason: 'Synthetic appeal preserved', created_at: '2026-10-24T08:00:00Z'}]});
    }
    unexpected.push(`${request.method()} ${path}`);
    return route.abort('blockedbyclient');
  });
  await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  return {reads, unexpected, runtimeErrors, writes, policyWrites, userWrites, reviewCalls, deleteCalls,
    planPendingReview: (response = {eligible: true, spotifyId: 'pending:server-reviewed-synthetic-user', createdAt: '2026-10-01T00:00:00Z', blockers: [] as string[]}, fail = false, hold = false) => {
      let release = () => {};
      const wait = hold ? new Promise<void>(resolve => {release = resolve;}) : undefined;
      pendingReviews.push({response, fail, wait}); return release;
    }, planPendingDelete: (fail = false, hold = false, removeOnFailure = false) => {
      let release = () => {};
      const wait = hold ? new Promise<void>(resolve => {release = resolve;}) : undefined;
      pendingDeletes.push({fail, removeOnFailure, wait}); return release;
    }, planRuns: (rows: unknown[], fail = false, hold = false) => {
    let release = () => {};
    const wait = hold ? new Promise<void>(resolve => {release = resolve;}) : undefined;
    runPlans.push({rows, fail, wait});
    return release;
  }, planUserRead: (fail = false, hold = false, timezone?: string) => {
    let release = () => {};
    const wait = hold ? new Promise<void>(resolve => {release = resolve;}) : undefined;
    userPlans.push({fail, wait, timezone});
    return release;
  }, releaseWrite: () => releaseWrite!(), failNextRuns: () => {failRuns = true;}};
}

for (const height of [600, 1000]) {
  test(`retained administration survives health removal and refresh recovery at short/tall height ${height}`, async ({page}, info) => {
    const fixture = await setupAdmin(page, true);
    await page.goto('/admin');
    const admin = page.locator('app-admin');
    await expect(admin.getByRole('heading', {name: 'Site settings', exact: true})).toBeVisible();
    await expect(admin.getByText('Synthetic schedule user', {exact: true})).toBeVisible();
    await expect(admin.getByText('TEST-ADMIN-RECEIPT', {exact: true})).toBeVisible();
    await expect(admin.locator('.admin-notice.appeal')).toContainText('Synthetic appeal preserved');
    await expect(admin.getByRole('region', {name: 'Listening history schedule limit'}).getByRole('spinbutton', {name: 'Minimum interval', exact: true})).toHaveValue('60');
    await expect(admin.getByRole('heading', {name: 'Runtime health', exact: true})).toHaveCount(0);
    await expect(admin.locator('.operations-panel')).toHaveCount(0);
    const auditToggle = admin.locator('.runs-heading > [role="button"]');
    await auditToggle.focus();
    await page.keyboard.press('Enter');
    await expect(auditToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(admin.getByText('Synthetic audit user', {exact: false})).toBeVisible();
    await page.keyboard.press('Space');
    await expect(auditToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(admin.locator('#admin-runs-content')).toHaveCount(0);
    await admin.getByRole('button', {name: 'Expand recent runs', exact: true}).click();
    await expect(admin.getByText('Synthetic audit user', {exact: false})).toBeVisible();
    await expect(admin.getByText('Synthetic retry pending', {exact: true})).toBeVisible();
    const runsBefore = fixture.reads.filter(name => name === 'admin_list_sync_runs').length;
    const otherReadsBefore = fixture.reads.filter(name => name !== 'admin_list_sync_runs').length;
    await admin.getByRole('button', {name: 'Refresh recent runs', exact: true}).click();
    await expect.poll(() => fixture.reads.filter(name => name === 'admin_list_sync_runs').length).toBe(runsBefore + 1);
    await expect(admin.getByRole('button', {name: 'Refresh recent runs', exact: true})).toBeEnabled();
    await expect(auditToggle).toHaveAttribute('aria-expanded', 'true');
    expect(fixture.reads.filter(name => name !== 'admin_list_sync_runs').length).toBe(otherReadsBefore);
    await auditToggle.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(auditToggle).toBeFocused();
    expect(await auditToggle.evaluate(element => {
      const style = getComputedStyle(element);
      return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    })).toBe(true);
    const geometry = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => document.fonts.ready);
      await expect(admin.getByRole('heading', {name: 'User schedules', exact: true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = await admin.locator('.admin-shell').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expectNoBlockingAxeViolations(page);
      await admin.screenshot({path: info.outputPath(`retained-admin-${width}x${height}.png`), animations: 'disabled'});
      geometry.push({width, height, box});
    }
    const before = Object.fromEntries(retainedReads.map(name => [name, fixture.reads.filter(read => read === name).length]));
    fixture.failNextRuns();
    await admin.locator('.admin-hero').getByRole('button', {name: 'Refresh', exact: true}).click();
    await expect(admin.getByRole('alert')).toContainText('Synthetic audit trail interruption');
    await expect(admin.getByText('Synthetic schedule user', {exact: true})).toBeVisible();
    await expect(admin.locator('.admin-notice.appeal')).toContainText('Synthetic appeal preserved');
    for (const name of retainedReads) expect(fixture.reads.filter(read => read === name).length, name).toBe(before[name] + 1);
    await admin.locator('.admin-hero').getByRole('button', {name: 'Refresh', exact: true}).click();
    await expect(admin.getByRole('alert')).toHaveCount(0);
    await expect(admin.getByText('Synthetic retry pending', {exact: true})).toBeVisible();
    for (const name of retainedReads) expect(fixture.reads.filter(read => read === name).length, name).toBe(before[name] + 2);
    expect(fixture.reads).not.toContain('admin_operational_health');
    expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
    await info.attach('admin-service-boundaries', {body: JSON.stringify({...fixture, geometry}), contentType: 'application/json'});
  });
}

test('a non-admin cloud identity cannot mount administration or read privileged inventories', async ({page}) => {
  const fixture = await setupAdmin(page, false);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/playlists$/);
  await expect(page.locator('app-admin')).toHaveCount(0);
  expect(fixture.reads).toContain('is_app_admin');
  expect(fixture.reads.filter(name => name.startsWith('admin_'))).toEqual([]);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
});


test('policy save validates, blocks duplicate writes and recovers acknowledged saves with read-only refresh', async ({page}, info) => {
  const fixture = await setupAdmin(page, true, true);
  await page.goto('/admin');
  const admin = page.locator('app-admin');
  const history = admin.getByRole('region', {name: 'Listening history schedule limit', exact: true});
  const stats = admin.getByRole('region', {name: 'Short-term stats schedule limit', exact: true});
  await expect(history).toBeVisible();
  await stats.getByRole('spinbutton', {name: 'Minimum interval', exact: true}).fill('37');
  await history.getByRole('combobox', {name: 'Unit', exact: true}).selectOption('hours');
  await history.getByRole('spinbutton', {name: 'Minimum interval', exact: true}).fill('169');
  await history.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(history.getByRole('status')).toContainText('1–168 hours');
  expect(fixture.writes).toEqual([]);
  await history.getByRole('spinbutton', {name: 'Minimum interval', exact: true}).fill('2');
  await history.getByRole('button', {name: 'Save', exact: true}).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(history.getByRole('button', {name: 'Saving…', exact: true})).toBeDisabled();
  await expect(history.getByRole('spinbutton')).toBeDisabled();
  await expect(history.getByRole('combobox')).toBeDisabled();
  await expect(history.getByRole('switch')).toBeDisabled();
  await expect(stats.getByRole('button', {name: 'Save', exact: true})).toBeEnabled();
  await page.keyboard.press('Enter');
  expect(fixture.writes).toEqual([{p_task_key: 'listening_history', p_available: true, p_interval_value: 2, p_interval_unit: 'hours'}]);
  fixture.releaseWrite();
  await expect(history.getByRole('status')).toContainText('Policy saved, but current user schedules could not be refreshed.');
  await expect(history.getByRole('button', {name: 'Refresh policy', exact: true})).toBeEnabled();
  await expect(stats.getByRole('spinbutton')).toHaveValue('37');
  const before = fixture.reads.length;
  await history.getByRole('button', {name: 'Refresh policy', exact: true}).click();
  await expect(history.getByRole('status')).toContainText('limit saved.');
  await expect(history.getByRole('spinbutton')).toHaveValue('120');
  await expect(history.getByRole('combobox')).toHaveValue('minutes');
  await expect(history.getByRole('combobox')).toHaveCSS('appearance', 'none');
  await expect(history.getByRole('spinbutton')).toHaveCSS('appearance', 'textfield');
  await expect(history.getByRole('combobox')).toHaveCSS('background-color', 'rgb(13, 19, 15)');
  await history.getByRole('spinbutton').focus();
  await page.keyboard.press('ArrowUp');
  await expect(history.getByRole('spinbutton')).toHaveValue('121');
  await page.keyboard.press('ArrowDown');
  await expect(history.getByRole('spinbutton')).toHaveValue('120');
  await expect(stats.getByRole('spinbutton')).toHaveValue('37');
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.reads.slice(before).sort()).toEqual(['admin_list_required_sync_reasons', 'admin_list_schedule_status', 'admin_list_sync_schedule_policy', 'admin_list_users'].sort());
  await history.getByRole('switch').focus();
  for (const control of [history.getByRole('spinbutton'), history.getByRole('combobox'), history.getByRole('button', {name: 'Save', exact: true})]) {
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    expect(await control.evaluate(element => {
      const style = getComputedStyle(element);
      return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })).toBe(true);
  }
  await page.emulateMedia({reducedMotion: 'reduce'});
  expect(await history.locator('.switch-track').evaluate(element => getComputedStyle(element, '::after').transitionDuration)).toBe('0s');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expectNoBlockingAxeViolations(page);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.runtimeErrors).toEqual([]);
  await info.attach('policy-service-boundaries', {body: JSON.stringify({reads: fixture.reads, writes: fixture.writes}), contentType: 'application/json'});
});


for (const height of [600, 1000]) {
  test(`policy editor read-only responsive geometry at height ${height}`, async ({page}, info) => {
    const fixture = await setupAdmin(page, true);
    await page.goto('/admin');
    const admin = page.locator('app-admin');
    const history = admin.getByRole('region', {name: 'Listening history schedule limit', exact: true});
    const stats = admin.getByRole('region', {name: 'Short-term stats schedule limit', exact: true});
    await expect(history).toBeVisible();
    await history.getByRole('spinbutton', {name: 'Minimum interval', exact: true}).fill('120');
    await stats.getByRole('spinbutton', {name: 'Minimum interval', exact: true}).fill('37');
    const geometry = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => document.fonts.ready);
      await expect(history).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of await history.locator('input, select, button').all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      const controlBoxes = await Promise.all([
        history.getByRole('spinbutton'), history.getByRole('combobox'), history.getByRole('button', {name: 'Save', exact: true})
      ].map(control => control.boundingBox()));
      for (const box of controlBoxes) {
        expect(box).not.toBeNull();
        // Firefox reports fractional layout coordinates (e.g.48.000061px).
        expect(box!.height).toBeCloseTo(48, 2);
      }
      for (let index = 0; index < controlBoxes.length; index++) for (let sibling = index + 1; sibling < controlBoxes.length; sibling++) {
        const a = controlBoxes[index]!, b = controlBoxes[sibling]!;
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
      expect(await history.getByRole('combobox').evaluate(element => {
        const select = element as HTMLSelectElement, style = getComputedStyle(select);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = style.font;
        // The explicit right padding reserves the custom chevron, including its gap.
        const available = select.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
        return context.measureText(select.selectedOptions[0].text).width <= available;
      })).toBe(true);
      await expect(history.locator('.action-icon')).toHaveCSS('background-color', 'rgb(162, 173, 166)');
      await expectNoBlockingAxeViolations(page);
      await history.screenshot({path: info.outputPath(`policy-editor-${width}x${height}.png`), animations: 'disabled'});
      geometry.push({width, height, box: await history.boundingBox(), controlBoxes});
    }
    await expect(history.getByRole('spinbutton')).toHaveValue('120');
    await expect(stats.getByRole('spinbutton')).toHaveValue('37');
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.runtimeErrors).toEqual([]);
    await info.attach('policy-read-only-geometry-boundaries', {body: JSON.stringify({reads: fixture.reads, writes: fixture.writes, geometry}), contentType: 'application/json'});
  });
}


for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`audit records and read-only recovery with ${reducedMotion} motion`, async ({page}, info) => {
    // Eighteen responsive axe/screenshot checks share one held-read recovery flow.
    test.setTimeout(90_000);
    const fixture = await setupAdmin(page, true);
    const hostile = '<img src=x onerror="window.auditInjected=true">';
    const rows = ['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((status, index) => ({
      id: `audit-${status}`, user_id: 'synthetic-user', display_name: `Audit ${status}`, task_key: 'listening_history',
      status, trigger_type: index % 2 ? 'manual' : 'scheduled', requested_at: '2026-10-24T08:00:00Z',
      started_at: status === 'queued' ? null : '2026-10-24T08:00:01Z',
      finished_at: ['succeeded', 'failed', 'cancelled'].includes(status) ? '2026-10-24T08:00:09Z' : null,
      error: status === 'failed' ? hostile : null,
      details: {warnings: status === 'succeeded' ? ['Previous data retained', 42, '', null] : []}
    }));
    rows.push({...rows[2], id: 'audit-reversed', display_name: 'Audit reversed', started_at: '2026-10-24T08:00:10Z'});
    rows.push({...rows[2], id: 'audit-invalid', display_name: 'Audit invalid', requested_at: 'invalid', started_at: 'invalid', finished_at: 'invalid'});
    fixture.planRuns(rows);
    await page.emulateMedia({reducedMotion});
    await page.goto('/admin');
    const admin = page.locator('app-admin');
    await expect(admin.getByRole('heading', {name: 'Site settings', exact: true})).toBeVisible();
    const toggle = admin.locator('.runs-heading > [role="button"]');
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const records = admin.locator('v2-admin-run-record');
    const feedback = admin.locator('v2-admin-run-feedback');
    const refresh = admin.getByRole('button', {name: 'Refresh recent runs', exact: true});
    const feedbackGeometry: unknown[] = [];
    async function inspectFeedback(state: string) {
      for (const viewport of [{width: 390, height: 600}, {width: 1440, height: 1000}]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => document.fonts.ready);
        const box = await feedback.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expectNoBlockingAxeViolations(page);
        await feedback.screenshot({path: info.outputPath(`audit-${state}-${viewport.width}x${viewport.height}-${reducedMotion}.png`), animations: 'disabled'});
        feedbackGeometry.push({state, viewport, box});
      }
    }
    await expect(records).toHaveCount(7);
    for (const [index, label] of ['Queued', 'Running', 'Succeeded · Warning', 'Failed', 'Cancelled'].entries()) {
      await expect(records.nth(index).locator('.status')).toHaveText(label);
    }
    await expect(records.nth(2)).toContainText('Duration 8s');
    await expect(records.nth(2).locator('time')).toHaveCount(3);
    await expect(records.nth(2).locator('time').first()).toHaveAttribute('datetime', '2026-10-24T08:00:00Z');
    await expect(records.nth(2)).toContainText('Previous data retained');
    await expect(records.nth(3).getByText(hostile, {exact: true})).toBeVisible();
    await expect(records.locator('img')).toHaveCount(0);
    await expect(records.nth(5)).toContainText('No duration available');
    await expect(records.nth(5)).not.toContainText('Duration -');
    await expect(records.nth(6).locator('time')).toHaveCount(0);
    await expect(records.nth(6)).toContainText('No duration available');
    const geometry = [];
    for (const height of [600, 1000]) for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const record of await records.all()) {
        const box = await record.boundingBox();
        expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      await expectNoBlockingAxeViolations(page);
      await admin.locator('#admin-runs-content').screenshot({path: info.outputPath(`audit-records-${width}x${height}-${reducedMotion}.png`), animations: 'disabled'});
      geometry.push({width, height, records: await records.count()});
    }
    const before = fixture.reads.filter(name => name === 'admin_list_sync_runs').length;
    const release = fixture.planRuns([], true, true);
    await refresh.click();
    await expect(feedback.getByRole('status')).toContainText('Refreshing recent runs…');
    await expect(records).toHaveCount(7); await expect(refresh).toBeDisabled();
    await inspectFeedback('refreshing');
    await page.keyboard.press('Enter');
    expect(fixture.reads.filter(name => name === 'admin_list_sync_runs').length).toBe(before + 1);
    release();
    await expect(feedback.getByRole('status')).toContainText('Recent runs could not be refreshed');
    await expect(records).toHaveCount(7);
    await inspectFeedback('refresh-error');
    fixture.planRuns([]); await refresh.click();
    await expect(feedback.getByRole('status')).toContainText('No jobs have been queued yet.');
    await expect(records).toHaveCount(0);
    await inspectFeedback('empty');
    const releaseEmpty = fixture.planRuns([], true, true);
    await refresh.click();
    await expect(feedback.getByRole('status')).toContainText('Loading recent runs…');
    await expect(refresh).toBeDisabled();
    await inspectFeedback('loading');
    releaseEmpty();
    await expect(feedback.getByRole('status')).toContainText('Recent runs could not be loaded');
    await inspectFeedback('load-error');
    fixture.planRuns(rows); await refresh.click();
    await expect(feedback).toHaveCount(0); await expect(records).toHaveCount(7);
    await toggle.focus(); await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter'); await expect(records).toHaveCount(7);
    expect(fixture.unexpected).toEqual([]); expect(fixture.writes).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
    await info.attach('audit-read-boundaries-and-geometry', {body: JSON.stringify({reads: fixture.reads, geometry, feedbackGeometry, reducedMotion}), contentType: 'application/json'});
  });
}


test('user save retains edits made during the write without submitting them or duplicating work', async ({page}) => {
  const fixture = await setupAdmin(page, true, false, true);
  await page.goto('/admin');
  const card = page.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
  await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
  const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
  await timezone.fill('Europe/London');
  const save = card.getByRole('button', {name: 'Save', exact: true});
  await save.click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(save).toBeDisabled();
  await expect(card.getByRole('button', {name: 'Run enabled tasks', exact: true})).toBeDisabled();
  await timezone.fill('Europe/Paris');
  await timezone.press('Enter');
  expect(fixture.writes).toHaveLength(1);
  fixture.releaseWrite();
  await expect(save).toBeEnabled();
  await expect(timezone).toHaveValue('Europe/Paris');
  await expect(page.getByRole('status').filter({hasText: 'Synchronization settings saved for Synthetic schedule user.'})).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({p_timezone: 'Europe/London', p_user_id: 'synthetic-user'});
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.runtimeErrors).toEqual([]);
  await expectNoBlockingAxeViolations(page);
});


for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`user readback recovery preserves drafts without repeating saves with ${reducedMotion} motion`, async ({page}, info) => {
    // Twelve responsive axe checks share one committed-write/repeated-read recovery flow.
    test.setTimeout(90_000);
    const fixture = await setupAdmin(page, true, false, true);
    await page.emulateMedia({reducedMotion});
    await page.goto('/admin');
    const card = page.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
    await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
    const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
    const feedback = card.locator('v2-admin-user-save-feedback [role="status"]');
    await timezone.fill('Europe/London');
    fixture.planUserRead(true);
    await card.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(feedback).toContainText('Saving settings…');
    await expect(feedback).toHaveAttribute('aria-busy', 'true');
    await timezone.fill('Europe/Paris');
    fixture.releaseWrite();
    await expect(feedback).toContainText('Settings saved · Refresh needed');
    await expect(feedback).not.toHaveAttribute('aria-busy', 'true');
    const recovery = card.getByRole('button', {name: 'Refresh user settings', exact: true});
    await expect(recovery).toBeEnabled();
    await expect(card.getByRole('button', {name: 'Save', exact: true})).toHaveCount(0);
    const geometry = [];
    for (const height of [600, 1000]) for (const width of [320, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({width, height}); await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = await card.boundingBox(), status = await feedback.boundingBox(), button = await recovery.boundingBox();
      expect(bounds).not.toBeNull(); expect(status).not.toBeNull(); expect(button).not.toBeNull();
      for (const box of [status!, button!]) {
        expect(box.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.005);
      }
      expect(button!.height).toBeCloseTo(48, 2);
      const labelLines = await recovery.evaluate(element => {
        const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Refresh user settings'))!;
        const range = document.createRange(); range.selectNode(text);
        return [...range.getClientRects()].filter(rect => rect.width > 0).length;
      });
      expect(labelLines).toBe(1);
      const queue = await card.getByRole('button', {name: 'Run enabled tasks', exact: true}).boundingBox();
      expect(queue).not.toBeNull();
      const overlapX = Math.min(button!.x + button!.width, queue!.x + queue!.width) - Math.max(button!.x, queue!.x);
      const overlapY = Math.min(button!.y + button!.height, queue!.y + queue!.height) - Math.max(button!.y, queue!.y);
      expect(overlapX > 0.005 && overlapY > 0.005).toBe(false);
      await expectNoBlockingAxeViolations(page);
      geometry.push({width, height, status, button, queue, labelLines});
      if ([390, 1440].includes(width) && height === 600) {
        await feedback.screenshot({path: info.outputPath(`user-read-error-${width}-${reducedMotion}.png`), animations: 'disabled'});
        await recovery.screenshot({path: info.outputPath(`user-recovery-action-${width}-${reducedMotion}.png`), animations: 'disabled'});
      }
    }
    const before = fixture.reads.filter(name => name === 'admin_list_users').length;
    const releaseFailure = fixture.planUserRead(true, true);
    await recovery.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(recovery).toBeFocused();
    await expect(recovery).toHaveCSS('border-color', 'rgb(159, 255, 200)');
    await page.keyboard.press('Enter');
    await expect(feedback).toContainText('Refreshing user settings…');
    await expect(feedback).toHaveAttribute('aria-busy', 'true');
    await expect(recovery).toBeDisabled();
    await expect(card.getByRole('button', {name: 'Run enabled tasks', exact: true})).toBeDisabled();
    await expect.poll(() => fixture.reads.filter(name => name === 'admin_list_users').length).toBe(before + 1);
    await page.keyboard.press('Enter');
    expect(fixture.writes).toHaveLength(1);
    await timezone.fill('Europe/Berlin');
    releaseFailure();
    await expect(feedback).toContainText('Settings saved · Refresh needed');
    await expect(timezone).toHaveValue('Europe/Berlin');
    const releaseSuccess = fixture.planUserRead(false, true);
    await recovery.click();
    await expect(feedback).toContainText('Refreshing user settings…');
    releaseSuccess();
    await expect(feedback).toContainText('Settings saved · Unsaved changes');
    await expect(timezone).toHaveValue('Europe/Berlin');
    await expect(recovery).toHaveCount(0);
    await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeEnabled();
    expect(fixture.writes).toHaveLength(1);
    expect(fixture.writes[0]).toMatchObject({p_timezone: 'Europe/London'});
    expect(fixture.reads.filter(name => name === 'admin_list_users')).toHaveLength(before + 2);
    expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
    const evidence = info.outputPath('user-recovery-geometry-and-read-boundaries.json');
    await writeFile(evidence, JSON.stringify({geometry, reads: fixture.reads, writes: fixture.writes, reducedMotion}, null, 2));
    await info.attach('user-recovery-geometry-and-read-boundaries', {path: evidence, contentType: 'application/json'});
  });
}


test('a later edit matching current server settings is saved without a redundant mutation', async ({page}) => {
  const fixture = await setupAdmin(page, true, false, true);
  await page.goto('/admin');
  const card = page.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
  await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
  const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
  await timezone.fill('Europe/London');
  fixture.planUserRead(false, false, 'Europe/Paris');
  await card.getByRole('button', {name: 'Save', exact: true}).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await timezone.fill('Europe/Paris');
  fixture.releaseWrite();
  const feedback = card.locator('v2-admin-user-save-feedback [role="status"]');
  await expect(feedback.getByRole('heading', {name: 'Settings saved', exact: true})).toBeVisible();
  await expect(feedback).not.toContainText('Unsaved changes');
  await expect(timezone).toHaveValue('Europe/Paris');
  await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({p_timezone: 'Europe/London'});
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await expectNoBlockingAxeViolations(page);
});


test('independent user drafts survive policy recovery and explicit dashboard refresh', async ({page}) => {
  const fixture = await setupAdmin(page, true, true);
  await page.goto('/admin');
  const admin = page.locator('app-admin');
  const card = admin.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
  await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
  const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
  const optionalHistory = card.getByRole('switch', {name: 'Enable optional Listening history', exact: true});
  await timezone.fill('Europe/London'); await optionalHistory.uncheck();
  const policy = admin.getByRole('region', {name: 'Listening history schedule limit', exact: true});
  await policy.getByRole('combobox', {name: 'Unit', exact: true}).selectOption('hours');
  await policy.getByRole('spinbutton').fill('2'); await policy.getByRole('button', {name: 'Save', exact: true}).click();
  fixture.releaseWrite();
  await expect(policy.getByRole('status')).toContainText('Policy saved, but current user schedules could not be refreshed.');
  await policy.getByRole('button', {name: 'Refresh policy', exact: true}).click();
  await expect(policy.getByRole('status')).toContainText('limit saved.');
  await expect(timezone).toHaveValue('Europe/London'); await expect(optionalHistory).not.toBeChecked();
  fixture.planUserRead(false, false, 'Asia/Tokyo');
  await admin.getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(timezone).toHaveValue('Europe/London'); await expect(optionalHistory).not.toBeChecked();
  // Returning to the latest server baseline makes this field clean again.
  await timezone.fill('Asia/Tokyo');
  fixture.planUserRead(false, false, 'Europe/Paris');
  await admin.getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(timezone).toHaveValue('Europe/Paris'); await expect(optionalHistory).not.toBeChecked();
  expect(fixture.userWrites).toEqual([]); expect(fixture.policyWrites).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await expectNoBlockingAxeViolations(page);
});

test('an older policy snapshot cannot rewind a completed user save', async ({page}) => {
  const fixture = await setupAdmin(page, true, true, true);
  await page.goto('/admin');
  const admin = page.locator('app-admin');
  const card = admin.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
  await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
  const policy = admin.getByRole('region', {name: 'Listening history schedule limit', exact: true});
  await policy.getByRole('combobox', {name: 'Unit', exact: true}).selectOption('hours');
  await policy.getByRole('spinbutton').fill('2'); await policy.getByRole('button', {name: 'Save', exact: true}).click();
  fixture.releaseWrite();
  await expect(policy.getByRole('status')).toContainText('Policy saved, but current user schedules could not be refreshed.');
  const releaseOldRead = fixture.planUserRead(false, true);
  await policy.getByRole('button', {name: 'Refresh policy', exact: true}).click();
  await expect(policy.getByRole('button', {name: 'Saving…', exact: true})).toBeDisabled();
  const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
  await timezone.fill('Europe/London');
  await card.getByRole('button', {name: 'Save', exact: true}).click();
  const feedback = card.locator('v2-admin-user-save-feedback [role="status"]');
  await expect(feedback.getByRole('heading', {name: 'Settings saved', exact: true})).toBeVisible();
  releaseOldRead();
  await expect(policy.getByRole('status')).toContainText('limit saved.');
  await expect(timezone).toHaveValue('Europe/London');
  await expect(feedback.getByRole('heading', {name: 'Settings saved', exact: true})).toBeVisible();
  await expect(feedback).not.toContainText('Unsaved changes');
  expect(fixture.policyWrites).toHaveLength(1); expect(fixture.userWrites).toHaveLength(1);
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await expectNoBlockingAxeViolations(page);
});

 test('mounted task drafts validate without writing, then save only the activated values', async ({page}, info) => {
  const fixture = await setupAdmin(page, true, false, true);
  await page.goto('/admin');
  const card = page.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
  await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
  const history = card.getByRole('spinbutton', {name: 'Listening history interval', exact: true});
  const short = card.getByRole('spinbutton', {name: 'Short-term stats interval', exact: true});
  const shortUnit = card.getByRole('combobox', {name: 'Short-term stats interval unit', exact: true});
  const optional = card.getByRole('switch', {name: 'Enable optional Listening history', exact: true});
  const save = card.getByRole('button', {name: 'Save', exact: true});
  const feedback = card.locator('v2-admin-user-save-feedback [role="status"]');
  await expect(card.locator('v2-admin-user-task-editor')).toHaveCount(6);
  await history.fill(''); await save.click();
  await expect(feedback).toContainText('Check schedule intervals');
  await expect(feedback).toContainText('nothing was saved');
  await expect(history).toHaveValue(''); expect(fixture.writes).toEqual([]);
  await history.fill('60'); await history.press('ArrowUp'); await expect(history).toHaveValue('61');
  await history.press('ArrowDown'); await expect(history).toHaveValue('60');
  await optional.focus(); await optional.press('Space'); await expect(optional).not.toBeChecked();
  await optional.press('Space'); await expect(optional).toBeChecked();
  await card.getByRole('textbox', {name: 'Schedule timezone', exact: true}).fill('Europe/London');
  await save.click(); await expect(feedback).toContainText('Saving settings…');
  await short.fill('3'); await shortUnit.selectOption('days');
  fixture.releaseWrite(); await expect(feedback).toContainText('Settings saved · Unsaved changes');
  await expect(short).toHaveValue('3'); await expect(shortUnit).toHaveValue('days');
  await expect(history).toHaveValue('60'); await expect(optional).toBeChecked();
  expect(fixture.userWrites).toHaveLength(1);
  expect(fixture.userWrites[0]).toMatchObject({p_short_term_interval_hours: 24, p_short_term_interval_unit: 'hours'});
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await expectNoBlockingAxeViolations(page);
  await card.screenshot({path: info.outputPath('mounted-task-drafts.png'), animations: 'disabled'});
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  test(`mounted task editors resize at ${height}px with ${reducedMotion} motion`, async ({page}, info) => {
    const fixture = await setupAdmin(page, true);
    await page.emulateMedia({reducedMotion});
    await page.goto('/admin');
    const card = page.locator('.admin-user-card').filter({has: page.getByRole('heading', {name: 'Synthetic schedule user', exact: true})});
    await card.getByRole('button', {name: 'Expand Synthetic schedule user settings', exact: true}).click();
    const history = card.getByRole('spinbutton', {name: 'Listening history interval', exact: true});
    await history.fill('123');
    const geometry = [];
    for (const width of [320, 390, 600, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({width, height}); await page.evaluate(() => document.fonts.ready);
      const boxes = await card.locator('v2-admin-user-task-editor').evaluateAll(elements => elements.map(element => {
        const editor = element.querySelector('section')!;
        const interval = element.querySelector('input[type="number"]')!;
        const unit = element.querySelector('select')!;
        const box = editor.getBoundingClientRect(), number = interval.getBoundingClientRect(), select = unit.getBoundingClientRect();
        return {width: box.width, height: box.height, overflow: editor.scrollWidth > editor.clientWidth,
          inside: [number, select].every(field => field.x >= box.x && field.right <= box.right && field.y >= box.y && field.bottom <= box.bottom),
          fieldHeights: [number.height, select.height],
          stacked: select.y > number.y, sameLine: Math.abs(select.y - number.y) < 0.01,
          images: [...editor.querySelectorAll('img')].map(image => ({loaded: image.complete && image.naturalWidth > 0,
            nativeWidth: image.naturalWidth, width: image.getBoundingClientRect().width}))};
      }));
      expect(boxes).toHaveLength(6);
      for (const box of boxes) {
        expect(box.overflow).toBe(false); expect(box.inside).toBe(true); expect(box.fieldHeights).toEqual([48, 48]);
        expect(box.width <= 300 ? box.stacked : box.sameLine).toBe(true);
        for (const image of box.images) {expect(image.loaded).toBe(true); expect(image.width).toBe(image.nativeWidth);}
      }
      const cardGeometry = await card.evaluate(element => {
        const box = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll<HTMLButtonElement>('footer button')].map(button => {
          const bounds = button.getBoundingClientRect();
          return {height: bounds.height, inside: bounds.left >= box.left && bounds.right <= box.right};
        });
        return {overflow: element.scrollWidth > element.clientWidth, controls};
      });
      expect(cardGeometry.overflow).toBe(false);
      expect(cardGeometry.controls.length).toBeGreaterThanOrEqual(2);
      for (const control of cardGeometry.controls) {expect(control.height).toBe(48); expect(control.inside).toBe(true);}
      const disclosure = card.locator('button.disclosure');
      await disclosure.focus(); await page.keyboard.press('Enter');
      await expect(disclosure).toBeFocused(); await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(history).toHaveCount(0);
      await page.keyboard.press('Space');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(history).toHaveValue('123'); geometry.push({width, height, boxes, cardGeometry});
    }
    await writeFile(info.outputPath('task-editor-geometry.json'), JSON.stringify(geometry, null, 2));
    await expectNoBlockingAxeViolations(page);
    expect(fixture.writes).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  });
}


const unavailableCardCases = [
  {name: 'backup off', identity: {backup_active: false}, badge: 'Cloud Backup off',
    reason: 'Turn on Cloud Backup before running tasks.'},
  {name: 'Spotify reconnect', identity: {has_refresh_token: false}, badge: 'Reconnect needed',
    reason: 'Reconnect Spotify before running tasks.'},
  {name: 'pending registration', identity: {spotify_id: 'pending:synthetic-registration', backup_active: false, has_refresh_token: false},
    badge: 'Pending Spotify verification', reason: 'Finish Spotify verification and connect Cloud Backup before running tasks.'}
] as const;

for (const scenario of unavailableCardCases) {
  test(`identified user card preserves editable drafts and explains unavailable Run for ${scenario.name}`, async ({page}, info) => {
    const displayName = 'SyntheticLongIdentity'.repeat(9);
    const spotifyId = 'synthetic-unbroken-spotify-identity-'.repeat(7);
    const identity = {display_name: displayName, spotify_id: spotifyId, ...scenario.identity};
    const fixture = await setupAdmin(page, true, false, false, identity);
    await page.setViewportSize({width: 390, height: 600});
    await page.goto('/admin');
    const card = page.locator('v2-admin-user-card');
    await expect(card.getByRole('heading', {name: scenario.name === 'pending registration' ? 'Incomplete registration' : displayName, exact: true})).toBeVisible();
    await expect(card.getByText(identity.spotify_id, {exact: true})).toBeVisible();
    await expect(card.getByText(scenario.badge, {exact: true})).toBeVisible();
    const disclosure = card.locator('button.disclosure');
    await expect(disclosure).toHaveAccessibleName(`Expand ${displayName} settings`);
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toBeFocused();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const timezone = card.getByRole('textbox', {name: 'Schedule timezone', exact: true});
    await timezone.fill('Europe/London');
    const history = card.getByRole('region', {name: 'Listening history optional schedule', exact: true});
    await history.getByRole('spinbutton', {name: 'Listening history interval', exact: true}).fill('123');
    const run = card.getByRole('button', {name: 'Run enabled tasks', exact: true});
    await expect(run).toBeDisabled();
    await expect(run).toHaveAccessibleDescription(scenario.reason);
    await expect(card.getByText(scenario.reason, {exact: true})).toBeVisible();
    await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeEnabled();
    await expect(timezone).toBeEditable();
    await expect(history.getByRole('switch')).toBeEnabled();
    await expect(card.getByRole('button', {name: 'Review incomplete registration', exact: true})).toHaveCount(scenario.name === 'pending registration' ? 1 : 0);
    await disclosure.focus();
    await page.keyboard.press('Space');
    await expect(disclosure).toBeFocused();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(timezone).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(timezone).toHaveValue('Europe/London');
    await expect(history.getByRole('spinbutton', {name: 'Listening history interval', exact: true})).toHaveValue('123');
    const geometry = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 600});
      await page.evaluate(() => document.fonts.ready);
      const bounds = await card.locator('article').evaluate(element => {
        const box = element.getBoundingClientRect();
        const copy = element.querySelector<HTMLElement>('.identity-copy')!;
        const title = copy.querySelector<HTMLElement>('h3')!;
        return {width: box.width, left: box.left, right: box.right, overflow: element.scrollWidth > element.clientWidth,
          titleOverflow: title.scrollWidth > title.clientWidth, copyOverflow: copy.scrollWidth > copy.clientWidth,
          footerButtons: [...element.querySelectorAll('footer button')].map(button => {
            const rect = button.getBoundingClientRect();
            return {height: rect.height, inside: rect.left >= box.left && rect.right <= box.right};
          })};
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.overflow).toBe(false); expect(bounds.titleOverflow).toBe(false); expect(bounds.copyOverflow).toBe(false);
      for (const button of bounds.footerButtons) {expect(button.height).toBe(48); expect(button.inside).toBe(true);}
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(run).toBeDisabled(); await expect(run).toHaveAccessibleDescription(scenario.reason);
      geometry.push({width, ...bounds});
    }
    await page.setViewportSize({width: 390, height: 600});
    await expectNoBlockingAxeViolations(page);
    await card.screenshot({path: info.outputPath(`identified-user-${scenario.name.replaceAll(' ', '-')}.png`), animations: 'disabled'});
    expect(fixture.writes).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
    await info.attach('identified-user-capability-boundary', {body: JSON.stringify({identity, reason: scenario.reason, geometry, reads: fixture.reads}), contentType: 'application/json'});
  });
}

const pendingIdentity = {spotify_id: 'pending:synthetic-user', backup_active: false, has_refresh_token: false};
const eligiblePendingReview = {eligible: true, spotifyId: 'pending:server-reviewed-synthetic-user', createdAt: '2026-10-01T00:00:00Z', blockers: [] as string[]};
async function mountPendingRegistration(page: Page) {
  const fixture = await setupAdmin(page, true, false, false, pendingIdentity, true);
  await page.goto('/admin');
  const card = page.locator('v2-admin-user-card');
  await expect(card.getByRole('heading', {name: 'Incomplete registration', exact: true})).toBeVisible();
  await card.locator('button.disclosure').click();
  const reviewButton = card.getByRole('button', {name: 'Review incomplete registration', exact: true});
  return {fixture, card, reviewButton};
}

test('pending registration dialog cancels held review, ignores late eligibility and restores safe keyboard focus', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 480});
  const {fixture, card, reviewButton} = await mountPendingRegistration(page);
  const release = fixture.planPendingReview(eligiblePendingReview, false, true);
  await reviewButton.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Review incomplete registration');
  await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  expect(fixture.deleteCalls).toEqual([]);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(reviewButton).toBeFocused();
  const response = page.waitForResponse(url => url.url().includes('/rpc/admin_review_pending_spotify_profile'));
  release(); await response; await expect(dialog).toHaveCount(0);
  fixture.planPendingReview(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
  const cancel = dialog.getByRole('button', {name: 'Cancel', exact: true});
  const remove = dialog.getByRole('button', {name: 'Delete registration', exact: true});
  await expect(cancel).toBeFocused();
  expect(await dialog.locator('footer button').allTextContents()).toEqual(['Delete registration', 'Cancel']);
  expect(await page.locator('v2-admin-pending-review-dialog .review-overlay').evaluate(element => getComputedStyle(element).backdropFilter)).toContain('blur(12px)');
  expect(await card.evaluate(element => !!element.closest('[inert]'))).toBe(true);
  await page.keyboard.press('Tab'); await expect(remove).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(remove).toBeFocused();
  await page.keyboard.press('Tab'); await expect(cancel).toBeFocused();
  await expectNoBlockingAxeViolations(page);
  await dialog.screenshot({path: info.outputPath('pending-eligible-keyboard.png'), animations: 'disabled'});
  await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0); await expect(reviewButton).toBeFocused();
  expect(await card.evaluate(element => !!element.closest('[inert]'))).toBe(false);
  expect(fixture.reviewCalls).toHaveLength(2); expect(fixture.deleteCalls).toEqual([]); expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
});

test('pending registration dialog keeps blocked data literal and retries review errors without deletion', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 480});
  const {fixture, reviewButton} = await mountPendingRegistration(page);
  const hostile = '<img src=x onerror="window.pendingReviewInjected=true">';
  const blockers = [hostile, 'Synthetic linked data reason '.repeat(70)];
  fixture.planPendingReview({...eligiblePendingReview, eligible: false, blockers}); await reviewButton.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Registration kept');
  await expect(dialog.getByText(hostile, {exact: true})).toBeVisible();
  await expect(dialog.locator('img,script')).toHaveCount(0); await expect(dialog.getByRole('button', {name: 'Delete registration', exact: true})).toHaveCount(0);
  expect(await dialog.locator('.review-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await dialog.locator('.review-body').evaluate(element => {element.scrollTop = element.scrollHeight;});
  await expect(dialog.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
  await dialog.getByRole('button', {name: 'Close', exact: true}).click(); await expect(reviewButton).toBeFocused();
  fixture.planPendingReview(eligiblePendingReview, true); await reviewButton.click();
  await expect(dialog).toHaveAccessibleName('Review unavailable'); await expect(dialog.getByRole('alert')).toContainText('Synthetic review interruption');
  fixture.planPendingReview(); await dialog.getByRole('button', {name: 'Try review again', exact: true}).click();
  await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  expect(await page.evaluate(() => 'pendingReviewInjected' in window)).toBe(false);
  expect(fixture.reviewCalls).toHaveLength(3); expect(fixture.deleteCalls).toEqual([]); expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await info.attach('pending-blocked-review-boundaries', {body: JSON.stringify({blockers, reads: fixture.reads, writes: fixture.writes}), contentType: 'application/json'});
});

test('pending registration dialog deletes exact reviewed identity once and recovers acknowledged deletion using reads only', async ({page}, info) => {
  const {fixture, card, reviewButton} = await mountPendingRegistration(page);
  fixture.planPendingReview(); await reviewButton.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
  const releaseDelete = fixture.planPendingDelete(false, true); fixture.planUserRead(true);
  await dialog.getByRole('button', {name: 'Delete registration', exact: true}).click();
  await expect(dialog).toHaveAccessibleName('Deleting registration'); await expect.poll(() => fixture.deleteCalls.length).toBe(1);
  await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeDisabled();
  await expect(dialog.getByRole('button', {name: 'Delete registration', exact: true})).toHaveCount(0);
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toHaveAccessibleName('Deleting registration');
  releaseDelete(); await expect(dialog).toHaveAccessibleName('Registration deleted');
  await expect(dialog.getByRole('button', {name: 'Refresh user list', exact: true})).toBeEnabled();
  await expect(card).toHaveCount(0);
  await expectNoBlockingAxeViolations(page);
  fixture.planUserRead(true); await dialog.getByRole('button', {name: 'Refresh user list', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Refresh user list', exact: true})).toBeEnabled();
  await expect(dialog).toHaveAccessibleName('Registration deleted'); expect(fixture.deleteCalls).toHaveLength(1);
  const releaseRead = fixture.planUserRead(false, true);
  await dialog.getByRole('button', {name: 'Refresh user list', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Close', exact: true})).toBeDisabled();
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toHaveAccessibleName('Registration deleted');
  releaseRead(); await expect(dialog).toHaveCount(0); await expect(card).toHaveCount(0);
  await expect(page.locator('app-admin').getByRole('heading', {name: 'Analytify Admin', exact: true})).toBeFocused();
  expect(fixture.deleteCalls).toEqual([{p_user_id: 'synthetic-user', p_expected_spotify_id: 'pending:server-reviewed-synthetic-user'}]);
  expect(fixture.writes).toEqual(fixture.deleteCalls); expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  await info.attach('pending-acknowledged-read-only-recovery', {body: JSON.stringify({reads: fixture.reads, writes: fixture.writes}), contentType: 'application/json'});
});

for (const absent of [false, true]) {
  test(`pending registration dialog reconciles uncertain deletion with registration ${absent ? 'absent' : 'present'} without a second delete`, async ({page}) => {
    const {fixture, card, reviewButton} = await mountPendingRegistration(page);
    fixture.planPendingReview(); await reviewButton.click(); fixture.planPendingDelete(true, false, absent);
    const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
    await dialog.getByRole('button', {name: 'Delete registration', exact: true}).click();
    await expect(dialog).toHaveAccessibleName('Deletion not confirmed'); await expect(card).toHaveCount(1);
    const releaseRead = fixture.planUserRead(false, true);
    await dialog.getByRole('button', {name: 'Refresh user list', exact: true}).click();
    await expect(dialog).toHaveAccessibleName('Checking deletion outcome');
    await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveAccessibleName('Checking deletion outcome');
    releaseRead(); await expect(dialog).toHaveCount(0); await expect(card).toHaveCount(absent ? 0 : 1);
    if (absent) await expect(page.locator('app-admin .admin-notice.success[role=status]')).toContainText('no longer listed');
    else {
      await expect(reviewButton).toBeFocused(); await expect(reviewButton).toBeEnabled();
      await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeEnabled();
    }
    expect(fixture.deleteCalls).toHaveLength(1); expect(fixture.writes).toEqual(fixture.deleteCalls);
    expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
  });
}

test('pending registration dialog Close preserves uncertain deletion lock until Administration Refresh', async ({page}) => {
  const {fixture, card, reviewButton} = await mountPendingRegistration(page);
  fixture.planPendingReview(); await reviewButton.click(); fixture.planPendingDelete(true);
  const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
  await dialog.getByRole('button', {name: 'Delete registration', exact: true}).click();
  await expect(dialog).toHaveAccessibleName('Deletion not confirmed'); await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialog).toHaveCount(0); await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeDisabled();
  await expect(reviewButton).toBeDisabled(); await expect(card.getByRole('button', {name: 'Run enabled tasks', exact: true})).toBeDisabled();
  await expect(page.locator('app-admin').getByRole('alert')).toContainText('Administration Refresh');
  const topRefresh = page.locator('app-admin .admin-hero').getByRole('button', {name: 'Refresh', exact: true});
  fixture.planUserRead(true); await topRefresh.click(); await expect(page.locator('app-admin').getByRole('alert')).toContainText('Synthetic saved user read interruption');
  await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeDisabled(); await expect(reviewButton).toBeDisabled();
  await topRefresh.click(); await expect(card.getByRole('button', {name: 'Save', exact: true})).toBeEnabled(); await expect(reviewButton).toBeEnabled();
  expect(fixture.deleteCalls).toHaveLength(1); expect(fixture.writes).toEqual(fixture.deleteCalls);
  expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  test(`pending registration dialog scrolls long blocked reasons at height ${height} with ${reducedMotion} motion`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion});
    const {fixture, reviewButton} = await mountPendingRegistration(page);
    const blockers = ['SyntheticLongUnbrokenBlockedIdentity'.repeat(18), 'Synthetic linked records remain protected. '.repeat(85)];
    fixture.planPendingReview({...eligiblePendingReview, eligible: false, blockers}); await reviewButton.click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Registration kept');
    const geometry = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height}); await page.evaluate(() => document.fonts.ready);
      const measured = await dialog.evaluate(element => {
        const box = element.getBoundingClientRect(), body = element.querySelector<HTMLElement>('.review-body')!;
        const footer = element.querySelector('footer')!.getBoundingClientRect();
        return {x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
          overflow: element.scrollWidth > element.clientWidth, scrolls: body.scrollHeight > body.clientHeight,
          bodyBottom: body.getBoundingClientRect().bottom, footerTop: footer.top,
          buttons: [...element.querySelectorAll('footer button')].map(button => {const rect = button.getBoundingClientRect(); return {height: rect.height, right: rect.right, bottom: rect.bottom};})};
      });
      expect(measured.x).toBeGreaterThanOrEqual(16); expect(measured.y).toBeGreaterThanOrEqual(16);
      expect(measured.right).toBeLessThanOrEqual(width - 16); expect(measured.bottom).toBeLessThanOrEqual(height - 16);
      expect(measured.width).toBeLessThanOrEqual(576); expect(measured.overflow).toBe(false); expect(measured.scrolls).toBe(true);
      expect(measured.bodyBottom).toBeLessThanOrEqual(measured.footerTop);
      for (const button of measured.buttons) {expect(button.height).toBe(48); expect(button.right).toBeLessThanOrEqual(measured.right); expect(button.bottom).toBeLessThanOrEqual(measured.bottom);}
      await dialog.locator('.review-body').evaluate(element => {element.scrollTop = element.scrollHeight;});
      const close = dialog.getByRole('button', {name: 'Close', exact: true});
      const details = dialog.getByRole('region', {name: 'Registration review details'});
      await details.evaluate(element => {element.scrollTop = 0;});
      await close.focus(); await page.keyboard.press('Tab'); await expect(details).toBeFocused();
      await page.keyboard.press('PageDown'); await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await page.keyboard.press('Tab'); await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab'); await expect(details).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectNoBlockingAxeViolations(page); await dialog.screenshot({path: info.outputPath(`pending-blocked-${width}x${height}-${reducedMotion}.png`), animations: 'disabled'});
      geometry.push({width, height, ...measured});
    }
    await dialog.getByRole('button', {name: 'Close', exact: true}).click(); await expect(reviewButton).toBeFocused();
    fixture.planPendingReview(); await reviewButton.click(); await expect(dialog).toHaveAccessibleName('Delete incomplete registration?');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height});
      const box = await dialog.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(16); expect(box!.y).toBeGreaterThanOrEqual(16);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width - 16); expect(box!.y + box!.height).toBeLessThanOrEqual(height - 16);
      const buttons = dialog.locator('footer button'); await expect(buttons).toHaveCount(2);
      expect(await buttons.allTextContents()).toEqual(['Delete registration', 'Cancel']);
      for (const button of await buttons.all()) {
        const bounds = await button.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.height).toBe(48);
        expect(bounds!.x).toBeGreaterThanOrEqual(box!.x); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(box!.x + box!.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 16);
      }
      geometry.push({phase: 'eligible', width, height, box});
    }
    await expectNoBlockingAxeViolations(page);
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click(); await expect(reviewButton).toBeFocused();
    expect(fixture.writes).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(fixture.runtimeErrors).toEqual([]);
    await info.attach('pending-dialog-responsive-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
  });
}
