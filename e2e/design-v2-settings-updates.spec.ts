import {test, expect} from './fixtures';
import {Page} from '@playwright/test';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

async function setup(page: Page) {
  // Observe native transition completion without altering its update callback,
  // animation, result or errors. Sequential workflow assertions need a settled
  // destination; observing its DOM alone does not mean its transition finished.
  await page.addInitScript(() => {
    const state = window as Window & {updatesActiveTransitions?: number}; state.updatesActiveTransitions=0;
    if (!document.startViewTransition) return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = options => {
      const transition = start(options); state.updatesActiveTransitions!++;
      void transition.finished.then(() => {state.updatesActiveTransitions!--;}, () => {state.updatesActiveTransitions!--;});
      return transition;
    };
  });
  await mockSpotify(page); await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
  await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
  const errors: string[] = []; const expectedSaveFailures: string[] = []; const expectedReadFailures: string[] = []; const writes: Record<string, unknown>[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // The deliberately rejected first write produces a native HTTP-resource
    // diagnostic in Chromium. Only this exact exercised failure is expected.
    if (message.location().url.endsWith('/rpc/update_my_sync_schedule_preference') && /server responded with a status of 400/.test(message.text())) {
      expectedSaveFailures.push(message.text());
    } else if (message.location().url.endsWith('/rpc/get_my_sync_task_status') && /server responded with a status of 400/.test(message.text())) {
      expectedReadFailures.push(message.text());
    } else if (message.type() === 'error' || /DOM update timed out|Transition was aborted/.test(message.text())) errors.push(message.text());
  });
  const base = {optional_enabled: true, feature_required: false, effective_active: true, editable: true, reasons: [], interval_value: 7,
    interval_unit: 'days', minimum_interval_minutes: 10080, policy_available: true};
  let schedules = [
    {...base, task_key: 'listening_history', optional_enabled: false, effective_active: false, interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60},
    {...base, task_key: 'stats_short_term', interval_value: 24, interval_unit: 'hours', minimum_interval_minutes: 1440,
      feature_required: true, reasons: ['Required by your Song League']},
    {...base, task_key: 'stats_medium_term'}, {...base, task_key: 'stats_long_term'},
    {...base, task_key: 'song_league_playlists', editable: false, feature_required: true, reasons: ['Required by your Song Leagues']},
    {...base, task_key: 'shared_playlists', editable: false, effective_active: false, reasons: ['No shared Spotify copies need updates']}
  ];
  let failWrite = true; let release: (() => void) | null = null;
  let heldRead: Promise<void> | null = null; let readFailure = false;
  await page.route('**/rest/v1/rpc/get_my_sync_task_status', async route => {
    if (heldRead) {const pending = heldRead; heldRead = null; await pending;}
    if (readFailure) {readFailure = false; return route.fulfill({status:400,json:{message:'Schedule refresh unavailable'}});}
    await route.fulfill({json:schedules});
  });
  await page.route('**/rest/v1/rpc/update_my_sync_schedule_preference', async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (failWrite) {failWrite = false; return route.fulfill({status: 400, json: {message: 'Schedule save rejected'}});}
    await new Promise<void>(resolve => {release = resolve;});
    schedules = schedules.map(row => row.task_key === body.p_task_key ? {...row, optional_enabled: body.p_enabled,
      effective_active: body.p_enabled, interval_value: body.p_interval_value, interval_unit: body.p_interval_unit} : row);
    await route.fulfill({json: null});
  });
  await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/updates');
  await expect(page.locator('.v2-update-summary')).toHaveCount(6);
  await page.evaluate(async () => {await document.fonts.ready;});
  return {errors, expectedSaveFailures, expectedReadFailures, writes, release: () => release?.(), pending: () => !!release,
    holdRead: () => {let finish!: () => void; heldRead = new Promise(resolve => {finish=resolve;}); return finish;},
    failRead: () => {readFailure=true;}, empty: () => {schedules=[];},
    lockHistory: () => {schedules=schedules.map(row=>row.task_key==='listening_history'?{...row,feature_required:true}:row);}};
}

async function settledNavigation(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as Window & {updatesActiveTransitions?: number}).updatesActiveTransitions === 0);
}

for (const motion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  test(`Updates popup draft and keyboard containment (${motion}, height ${height})`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
    const s=await setup(page);const list=page.locator('v2-settings-updates');
    await expect(list.locator('a.v2-update-summary')).toHaveCount(3);await expect(list.locator('[data-task="shared_playlists"]')).toContainText('Disabled');
    await list.locator('a[data-task="listening_history"]').press('Enter');const editor=page.locator('v2-settings-update-editor');
    const toggle=editor.getByRole('switch',{name:'Automatic updates'});await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
    const every=editor.getByRole('button',{name:'Every 2',exact:true});await every.click();
    const dialog=page.getByRole('dialog',{name:'Every',exact:true});const input=dialog.getByRole('spinbutton',{name:'Every'});
    await expect(input).toBeFocused();await input.fill('4');await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(every).toBeFocused();
    await every.press('Enter');await expect(input).toHaveValue('2');await input.fill('1.5');await dialog.getByRole('button',{name:'Apply'}).click();
    await expect(dialog.getByRole('alert')).toContainText('whole-number');await input.fill('3');await dialog.getByRole('button',{name:'Apply'}).click();
    await expect(editor.getByRole('button',{name:'Every 3',exact:true})).toBeFocused();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
    const unit=page.getByRole('dialog',{name:'Unit',exact:true});const first=unit.getByRole('button',{name:'minutes',exact:true});
    await expect(first).toBeFocused();await first.press('Shift+Tab');await expect(unit.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
    await unit.getByRole('button',{name:'Cancel',exact:true}).press('Tab');await expect(first).toBeFocused();await unit.getByRole('button',{name:'days',exact:true}).press('Enter');
    await expect(unit).toHaveCount(0);expect(s.writes).toEqual([]);
    await settledNavigation(page);await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Disabled');await settledNavigation(page);
    await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).not.toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
    await writeFile(info.outputPath('update-draft.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors},null,2));
  });
  test(`Updates explicit save, retry and authoritative readback (${motion}, height ${height})`, async ({page},info) => {
    await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
    const s=await setup(page);const list=page.locator('v2-settings-updates');await list.locator('a[data-task="listening_history"]').click();
    const editor=page.locator('v2-settings-update-editor');const toggle=editor.getByRole('switch',{name:'Automatic updates'});
    await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
    await editor.getByRole('button',{name:'Every 2',exact:true}).click();const every=page.getByRole('dialog',{name:'Every',exact:true});
    await every.getByRole('spinbutton').fill('3');await every.getByRole('button',{name:'Apply'}).click();
    await editor.getByRole('button',{name:'Unit hours',exact:true}).click();await page.getByRole('dialog',{name:'Unit',exact:true}).getByRole('button',{name:'days',exact:true}).click();
    expect(s.writes).toEqual([]);await editor.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(editor.getByRole('alert')).toContainText('Schedule save rejected');await expect(toggle).toBeChecked();
    await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(toggle).toBeDisabled();await expect.poll(s.pending).toBe(true);
    expect(s.writes).toHaveLength(2);s.release();await expect(editor.getByText('Automatic updates saved',{exact:true})).toBeVisible();await expect(toggle).toBeEnabled();
    expect(s.writes).toEqual(Array(2).fill({p_task_key:'listening_history',p_enabled:true,p_interval_value:3,p_interval_unit:'days'}));
    await toggle.press('Space');await settledNavigation(page);await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Every 3 days');await settledNavigation(page);
    await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures.length).toBeLessThanOrEqual(1);
    await writeFile(info.outputPath('update-workflow.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors,expectedSaveFailures:s.expectedSaveFailures},null,2));
  });
  test(`Updates responsive cards and editor assets (${motion}, height ${height})`,async ({page},info)=>{
    await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];const list=page.locator('v2-settings-updates');
    for(const width of widths){
      await page.setViewportSize({width,height});await list.locator('a').first().click({trial:true});
      const sample=await list.evaluate(element=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        cards:[...element.querySelectorAll('.v2-update-summary')].map(card=>{const b=card.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height};}),
        images:[...element.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};})}));
      expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.images.every(img=>img.loaded)).toBe(true);
      for(const img of sample.images){const size=img.src?.endsWith('update-required.svg')?16:20;expect([img.width,img.height]).toEqual([size,size]);}
      for(const card of sample.cards){expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(width<768?68:88);}
      if(width>=768)for(let i=0;i<sample.cards.length;i+=2){expect(sample.cards[i].height).toBe(sample.cards[i+1].height);expect(sample.cards[i].top).toBe(sample.cards[i+1].top);}samples.push(sample);
    }
    await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await list.screenshot({path:info.outputPath('updates-list.png'),animations:'disabled'});
    await list.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await expect(editor.getByRole('switch')).toBeVisible();
    await editor.screenshot({path:info.outputPath('updates-editor.png'),animations:'disabled'});
    const images=await editor.locator('img').evaluateAll(elements=>elements.map(element=>{const img=element as HTMLImageElement;const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};}));
    expect(images.map(img=>[img.width,img.height,img.loaded])).toEqual([[18,18,true],[20,20,true],[48,24,true],[20,20,true]]);
    await expectNoBlockingAxeViolations(page);expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
    await writeFile(info.outputPath('update-card-geometry.json'),JSON.stringify({motion,height,samples,images,errors:s.errors},null,2));
  });
  test(`Updates popup resizing, blur and Cancel-last (${motion}, height ${height})`,async ({page},info)=>{
    await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];
    await page.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Every',exact:true});await expect(dialog.getByRole('spinbutton')).toBeFocused();
    for(const width of widths){
      await page.setViewportSize({width,height});await dialog.getByRole('button',{name:'Cancel',exact:true}).click({trial:true});
      const sample=await dialog.evaluate(element=>{const b=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,button')].map(e=>{const b=e.getBoundingClientRect();const css=getComputedStyle(e);return {left:b.left,right:b.right,height:b.height,text:e.textContent,fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight};});return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},blur:getComputedStyle(document.querySelector('.v2-interval-backdrop')!).backdropFilter,controls};});
      expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.box.left).toBeGreaterThanOrEqual(0);expect(sample.box.right).toBeLessThanOrEqual(width);expect(sample.box.top).toBeGreaterThanOrEqual(0);expect(sample.box.bottom).toBeLessThanOrEqual(height);
      expect(sample.box.width).toBe(Math.min(350,width-32));expect(sample.blur).toBe('blur(9px)');expect(sample.controls.at(-1)?.text).toBe('Cancel');
      expect(sample.controls.every(c=>c.height>=48&&c.left>=sample.box.left&&c.right<=sample.box.right)).toBe(true);
      for(const button of sample.controls.slice(1))expect([button.fontSize,button.fontWeight,button.lineHeight]).toEqual(['14px','600','20px']);samples.push(sample);
    }
    await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await dialog.screenshot({path:info.outputPath('updates-every.png'),animations:'disabled'});
    await expectNoBlockingAxeViolations(page);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
    const unit=page.getByRole('dialog',{name:'Unit',exact:true});await expect(unit.getByRole('button',{name:'minutes',exact:true})).toBeFocused();await unit.screenshot({path:info.outputPath('updates-unit.png'),animations:'disabled'});
    await unit.getByRole('button',{name:'Cancel',exact:true}).click();expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
    await writeFile(info.outputPath('update-popup-geometry.json'),JSON.stringify({motion,height,samples,errors:s.errors},null,2));
  });
}

test('Updates cached refresh, recovery, policy lock and empty account',async ({page},info)=>{
  await page.setViewportSize({width:360,height:480});const s=await setup(page);const list=page.locator('v2-settings-updates');
  const finish=s.holdRead();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(list.getByText('Refreshing automatic updates',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  s.failRead();finish();await expect(list.getByRole('alert')).toContainText('Schedule refresh unavailable');await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  await list.getByRole('button',{name:'Retry',exact:true}).click();await expect(list.getByRole('alert')).toHaveCount(0);await list.locator('a[data-task="listening_history"]').click();
  const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();await expect(page.getByRole('dialog').getByRole('spinbutton')).toBeFocused();
  s.lockHistory();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editor.getByRole('switch')).toHaveCount(0);await expect(editor.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);await expect(editor.getByText('This update is required',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'Back',exact:true}).click();await expect(list.locator('.v2-update-summary')).toHaveCount(6);s.empty();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(list.getByText('No automatic updates available',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(0);await expectNoBlockingAxeViolations(page);
  expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);expect(s.expectedReadFailures.length).toBeLessThanOrEqual(1);
  await writeFile(info.outputPath('update-recovery.json'),JSON.stringify({writes:s.writes,errors:s.errors,expectedReadFailures:s.expectedReadFailures},null,2));
});
