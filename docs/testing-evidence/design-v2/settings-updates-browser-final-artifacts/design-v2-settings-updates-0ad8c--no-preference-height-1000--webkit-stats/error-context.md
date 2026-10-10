# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates draft, popup focus and save recovery (no-preference, height 1000)
- Location: e2e/design-v2-settings-updates.spec.ts:47:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('v2-settings-updates').locator('[data-task="listening_history"]')
Expected substring: "Every 3 days"
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('v2-settings-updates').locator('[data-task="listening_history"]') with timeout 5000ms
  - waiting for locator('v2-settings-updates').locator('[data-task="listening_history"]')
  - Test timeout of 30000ms exceeded.

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Settings content":
  - heading "Settings" [level=1]
  - paragraph: Manage your account, notifications, updates and saved data.
  - navigation "Settings sections":
    - link "Account":
      - /url: /new/settings/account
    - link "Notifications":
      - /url: /new/settings/notifications
    - link "Updates":
      - /url: /new/settings/updates
    - link "Data":
      - /url: /new/settings/data
  - region "Automatic update settings":
    - heading "Automatic updates" [level=2]
    - paragraph: Choose which personal Spotify data updates in the background.
    - status:
      - strong: Loading automatic updates
      - paragraph: Checking saved schedules and required tasks.
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {Page} from '@playwright/test';
  3   | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  4   | import {writeFile} from 'node:fs/promises';
  5   | 
  6   | async function setup(page: Page) {
  7   |   await mockSpotify(page); await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  8   |   await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
  9   |   await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  10  |   await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
  11  |   const errors: string[] = []; const expectedSaveFailures: string[] = []; const writes: Record<string, unknown>[] = [];
  12  |   page.on('pageerror', error => errors.push(error.message));
  13  |   page.on('console', message => {
  14  |     // The deliberately rejected first write produces a native HTTP-resource
  15  |     // diagnostic in Chromium. Only this exact exercised failure is expected.
  16  |     if (message.location().url.endsWith('/rpc/update_my_sync_schedule_preference') && /server responded with a status of 400/.test(message.text())) {
  17  |       expectedSaveFailures.push(message.text());
  18  |     } else if (message.type() === 'error' || /DOM update timed out|Transition was aborted/.test(message.text())) errors.push(message.text());
  19  |   });
  20  |   const base = {optional_enabled: true, feature_required: false, effective_active: true, editable: true, reasons: [], interval_value: 7,
  21  |     interval_unit: 'days', minimum_interval_minutes: 10080, policy_available: true};
  22  |   let schedules = [
  23  |     {...base, task_key: 'listening_history', optional_enabled: false, effective_active: false, interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60},
  24  |     {...base, task_key: 'stats_short_term', interval_value: 24, interval_unit: 'hours', minimum_interval_minutes: 1440,
  25  |       feature_required: true, reasons: ['Required by your Song League']},
  26  |     {...base, task_key: 'stats_medium_term'}, {...base, task_key: 'stats_long_term'},
  27  |     {...base, task_key: 'song_league_playlists', editable: false, feature_required: true, reasons: ['Required by your Song Leagues']},
  28  |     {...base, task_key: 'shared_playlists', editable: false, effective_active: false, reasons: ['No shared Spotify copies need updates']}
  29  |   ];
  30  |   let failWrite = true; let release: (() => void) | null = null;
  31  |   await page.route('**/rest/v1/rpc/get_my_sync_task_status', route => route.fulfill({json: schedules}));
  32  |   await page.route('**/rest/v1/rpc/update_my_sync_schedule_preference', async route => {
  33  |     const body = route.request().postDataJSON(); writes.push(body);
  34  |     if (failWrite) {failWrite = false; return route.fulfill({status: 400, json: {message: 'Schedule save rejected'}});}
  35  |     await new Promise<void>(resolve => {release = resolve;});
  36  |     schedules = schedules.map(row => row.task_key === body.p_task_key ? {...row, optional_enabled: body.p_enabled,
  37  |       effective_active: body.p_enabled, interval_value: body.p_interval_value, interval_unit: body.p_interval_unit} : row);
  38  |     await route.fulfill({json: null});
  39  |   });
  40  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/updates');
  41  |   await expect(page.locator('.v2-update-summary')).toHaveCount(6);
  42  |   await page.evaluate(async () => {await document.fonts.ready;});
  43  |   return {errors, expectedSaveFailures, writes, release: () => release?.(), pending: () => !!release};
  44  | }
  45  | 
  46  | for (const motion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  47  |   test(`Updates draft, popup focus and save recovery (${motion}, height ${height})`, async ({page}, info) => {
  48  |     await page.emulateMedia({reducedMotion: motion}); await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height});
  49  |     const s = await setup(page); const list = page.locator('v2-settings-updates');
  50  |     await expect(list.locator('a.v2-update-summary')).toHaveCount(3);
  51  |     await expect(list.locator('[data-task="shared_playlists"]')).toContainText('Disabled');
  52  |     await list.locator('a[data-task="listening_history"]').press('Enter');
  53  |     const editor = page.locator('v2-settings-update-editor'); const every = editor.getByRole('button', {name: 'Every 2', exact: true});
  54  |     const toggle = editor.getByRole('switch', {name: 'Automatic updates'});
  55  |     await expect(toggle).not.toBeChecked(); await toggle.press('Space'); await expect(toggle).toBeChecked(); expect(s.writes).toEqual([]);
  56  |     await every.click(); const dialog = page.getByRole('dialog', {name: 'Every', exact: true}); const input = dialog.getByRole('spinbutton', {name: 'Every'});
  57  |     await expect(input).toBeFocused(); await input.fill('4'); await input.press('Escape'); await expect(dialog).toHaveCount(0); await expect(every).toBeFocused();
  58  |     await every.press('Enter'); await expect(input).toHaveValue('2'); await input.fill('1.5'); await dialog.getByRole('button', {name: 'Apply'}).click();
  59  |     await expect(dialog.getByRole('alert')).toContainText('whole-number'); await input.fill('3'); await dialog.getByRole('button', {name: 'Apply'}).click();
  60  |     await expect(editor.getByRole('button', {name: 'Every 3', exact: true})).toBeFocused();
  61  |     const unit = editor.getByRole('button', {name: 'Unit hours', exact: true}); await unit.click();
  62  |     const unitPopup = page.getByRole('dialog', {name: 'Unit', exact: true}); const first = unitPopup.getByRole('button', {name: 'minutes', exact: true});
  63  |     await expect(first).toBeFocused(); await first.press('Shift+Tab'); await expect(unitPopup.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  64  |     await unitPopup.getByRole('button', {name: 'Cancel', exact: true}).press('Tab'); await expect(first).toBeFocused();
  65  |     await unitPopup.getByRole('button', {name: 'days', exact: true}).press('Enter'); await expect(unitPopup).toHaveCount(0); expect(s.writes).toEqual([]);
  66  |     await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  67  |     await expect(editor.getByRole('alert')).toContainText('Schedule save rejected'); await expect(toggle).toBeChecked();
  68  |     await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  69  |     await expect(toggle).toBeDisabled(); await expect.poll(s.pending).toBe(true); expect(s.writes).toHaveLength(2); s.release();
  70  |     await expect(editor.getByText('Automatic updates saved', {exact: true})).toBeVisible(); await expect(toggle).toBeEnabled();
  71  |     expect(s.writes).toEqual(Array(2).fill({p_task_key:'listening_history', p_enabled:true, p_interval_value:3, p_interval_unit:'days'}));
  72  |     await expectNoBlockingAxeViolations(page); await toggle.press('Space'); await editor.getByRole('button', {name: 'Back', exact: true}).press('Enter');
> 73  |     await expect(list.locator('[data-task="listening_history"]')).toContainText('Every 3 days');
      |                                                                   ^ Error: expect(locator).toContainText(expected) failed
  74  |     await list.locator('a[data-task="listening_history"]').press('Enter'); await expect(toggle).toBeChecked();
  75  |     expect(s.errors).toEqual([]); expect(s.expectedSaveFailures.length).toBeLessThanOrEqual(1);
  76  |     await writeFile(info.outputPath('update-workflow.json'), JSON.stringify({motion,height,writes:s.writes,errors:s.errors,expectedSaveFailures:s.expectedSaveFailures}, null, 2));
  77  |   });
  78  | 
  79  |   test(`Updates responsive cards, fields and blurred popups (${motion}, height ${height})`, async ({page}, info) => {
  80  |     await page.emulateMedia({reducedMotion: motion}); const s = await setup(page); const samples = [];
  81  |     const widths = [320,360,390,760,767,768,1024,1440,1920];
  82  |     const list = page.locator('v2-settings-updates');
  83  |     for (const width of widths) {
  84  |       await page.setViewportSize({width,height}); await list.locator('a').first().click({trial:true});
  85  |       const sample = await list.evaluate(element => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
  86  |         cards:[...element.querySelectorAll('.v2-update-summary')].map(card => {const b=card.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,height:b.height};}),
  87  |         images:[...element.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};})}));
  88  |       expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.images.every(img=>img.loaded)).toBe(true);
  89  |       for(const card of sample.cards) {expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(width<768?68:88);}
  90  |       if(width>=768) for(let i=0;i<sample.cards.length;i+=2) {expect(sample.cards[i].height).toBe(sample.cards[i+1].height);expect(sample.cards[i].top).toBe(sample.cards[i+1].top);}
  91  |       samples.push(sample);
  92  |     }
  93  |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});
  94  |     await list.screenshot({path:info.outputPath('updates-list.png')});
  95  |     await list.locator('a[data-task="listening_history"]').click(); const editor=page.locator('v2-settings-update-editor');
  96  |     await expect(editor.getByRole('switch')).toBeVisible(); await editor.screenshot({path:info.outputPath('updates-editor.png')});
  97  |     await editor.getByRole('button',{name:'Every 2',exact:true}).click(); const dialog=page.getByRole('dialog',{name:'Every',exact:true});
  98  |     await expect(dialog.getByRole('spinbutton')).toBeFocused(); await dialog.screenshot({path:info.outputPath('updates-every.png')});
  99  |     for(const width of widths) {
  100 |       await page.setViewportSize({width,height}); await dialog.getByRole('button',{name:'Cancel',exact:true}).click({trial:true});
  101 |       const sample=await dialog.evaluate(element=>{const b=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,button')].map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,height:b.height,text:e.textContent};}); return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},blur:getComputedStyle(document.querySelector('.v2-interval-backdrop')!).backdropFilter,controls};});
  102 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.box.left).toBeGreaterThanOrEqual(0);expect(sample.box.right).toBeLessThanOrEqual(width);
  103 |       expect(sample.box.top).toBeGreaterThanOrEqual(0);expect(sample.box.bottom).toBeLessThanOrEqual(height);expect(sample.box.width).toBe(Math.min(350,width-32));
  104 |       expect(sample.blur).toBe('blur(9px)');expect(sample.controls.at(-1)?.text).toBe('Cancel');
  105 |       expect(sample.controls.every(c=>c.height>=48&&c.left>=sample.box.left&&c.right<=sample.box.right)).toBe(true); samples.push(sample);
  106 |     }
  107 |     await expectNoBlockingAxeViolations(page); await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  108 |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});
  109 |     await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  110 |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});await expect(unit.getByRole('button',{name:'minutes',exact:true})).toBeFocused();
  111 |     await unit.screenshot({path:info.outputPath('updates-unit.png')}); await unit.getByRole('button',{name:'Cancel',exact:true}).click();
  112 |     expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  113 |     await writeFile(info.outputPath('update-geometry.json'),JSON.stringify({motion,height,samples,errors:s.errors},null,2));
  114 |   });
  115 | }
  116 | 
```