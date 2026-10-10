# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates draft, popup focus and save recovery (reduce, height 480)
- Location: e2e/design-v2-settings-updates.spec.ts:38:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 6

- Array []
+ Array [
+   "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
+   "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
+   "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
+   "Failed to load resource: the server responded with a status of 400 (Bad Request)",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Automatic updates
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Automatic updates content" [active] [ref=f1e17]:
    - generic [ref=f1e20]:
      - generic [ref=f1e22]:
        - generic [ref=f1e23]:
          - heading "Listening history" [level=1] [ref=f1e24]
          - button "Back" [ref=f1e25] [cursor=pointer]
        - paragraph [ref=f1e26]: Edit this optional update. Required feature updates stay on.
      - region "Automatic update preference" [ref=f1e28]:
        - generic [ref=f1e30] [cursor=pointer]:
          - generic [ref=f1e31]:
            - strong [ref=f1e32]: Automatic updates
            - generic [ref=f1e33]: Update listening history in the background.
          - switch "Automatic updates" [checked] [ref=f1e35]
        - button "Every 3" [ref=f1e36] [cursor=pointer]:
          - strong [ref=f1e37]: Every
          - generic [ref=f1e38]: "3"
        - button "Unit days" [ref=f1e39] [cursor=pointer]:
          - strong [ref=f1e40]: Unit
          - generic [ref=f1e41]: days
        - status [ref=f1e43]:
          - strong [ref=f1e44]: "Minimum interval: 1 hour"
          - paragraph [ref=f1e45]: Choose an interval of 1 hour or longer.
        - button "Save changes" [ref=f1e46] [cursor=pointer]
        - paragraph [ref=f1e47]: Changes apply only after Save changes. Leaving through Back, Menu or any other navigation discards unsaved changes.
  - navigation "Primary navigation" [ref=f1e48]:
    - link "Playlists" [ref=f1e49] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e50]: 
    - link "Stats" [ref=f1e52] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e53]: 
    - link "History" [ref=f1e55] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e56]: 
  - contentinfo [ref=f1e58]:
    - generic [ref=f1e59]: Powered by Spotify
    - generic [ref=f1e60]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e61] [cursor=pointer]:
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
  9   |   const errors: string[] = []; const writes: Record<string, unknown>[] = [];
  10  |   page.on('pageerror', error => errors.push(error.message));
  11  |   page.on('console', message => {if (message.type() === 'error' || /DOM update timed out|Transition was aborted/.test(message.text())) errors.push(message.text());});
  12  |   const base = {optional_enabled: true, feature_required: false, effective_active: true, editable: true, reasons: [], interval_value: 7,
  13  |     interval_unit: 'days', minimum_interval_minutes: 10080, policy_available: true};
  14  |   let schedules = [
  15  |     {...base, task_key: 'listening_history', optional_enabled: false, effective_active: false, interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60},
  16  |     {...base, task_key: 'stats_short_term', interval_value: 24, interval_unit: 'hours', minimum_interval_minutes: 1440,
  17  |       feature_required: true, reasons: ['Required by your Song League']},
  18  |     {...base, task_key: 'stats_medium_term'}, {...base, task_key: 'stats_long_term'},
  19  |     {...base, task_key: 'song_league_playlists', editable: false, feature_required: true, reasons: ['Required by your Song Leagues']},
  20  |     {...base, task_key: 'shared_playlists', editable: false, effective_active: false, reasons: ['No shared Spotify copies need updates']}
  21  |   ];
  22  |   let failWrite = true; let release: (() => void) | null = null;
  23  |   await page.route('**/rest/v1/rpc/get_my_sync_task_status', route => route.fulfill({json: schedules}));
  24  |   await page.route('**/rest/v1/rpc/update_my_sync_schedule_preference', async route => {
  25  |     const body = route.request().postDataJSON(); writes.push(body);
  26  |     if (failWrite) {failWrite = false; return route.fulfill({status: 400, json: {message: 'Schedule save rejected'}});}
  27  |     await new Promise<void>(resolve => {release = resolve;});
  28  |     schedules = schedules.map(row => row.task_key === body.p_task_key ? {...row, optional_enabled: body.p_enabled,
  29  |       effective_active: body.p_enabled, interval_value: body.p_interval_value, interval_unit: body.p_interval_unit} : row);
  30  |     await route.fulfill({json: null});
  31  |   });
  32  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/updates');
  33  |   await expect(page.locator('.v2-update-summary')).toHaveCount(6);
  34  |   return {errors, writes, release: () => release?.(), pending: () => !!release};
  35  | }
  36  | 
  37  | for (const motion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  38  |   test(`Updates draft, popup focus and save recovery (${motion}, height ${height})`, async ({page}, info) => {
  39  |     await page.emulateMedia({reducedMotion: motion}); await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height});
  40  |     const s = await setup(page); const list = page.locator('v2-settings-updates');
  41  |     await expect(list.locator('a.v2-update-summary')).toHaveCount(3);
  42  |     await expect(list.locator('[data-task="shared_playlists"]')).toContainText('Disabled');
  43  |     await list.locator('a[data-task="listening_history"]').press('Enter');
  44  |     const editor = page.locator('v2-settings-update-editor'); const every = editor.getByRole('button', {name: 'Every 2', exact: true});
  45  |     const toggle = editor.getByRole('switch', {name: 'Automatic updates'});
  46  |     await expect(toggle).not.toBeChecked(); await toggle.press('Space'); await expect(toggle).toBeChecked(); expect(s.writes).toEqual([]);
  47  |     await every.click(); const dialog = page.getByRole('dialog', {name: 'Every', exact: true}); const input = dialog.getByRole('spinbutton', {name: 'Every'});
  48  |     await expect(input).toBeFocused(); await input.fill('4'); await input.press('Escape'); await expect(dialog).toHaveCount(0); await expect(every).toBeFocused();
  49  |     await every.press('Enter'); await expect(input).toHaveValue('2'); await input.fill('1.5'); await dialog.getByRole('button', {name: 'Apply'}).click();
  50  |     await expect(dialog.getByRole('alert')).toContainText('whole-number'); await input.fill('3'); await dialog.getByRole('button', {name: 'Apply'}).click();
  51  |     await expect(editor.getByRole('button', {name: 'Every 3', exact: true})).toBeFocused();
  52  |     const unit = editor.getByRole('button', {name: 'Unit hours', exact: true}); await unit.click();
  53  |     const unitPopup = page.getByRole('dialog', {name: 'Unit', exact: true}); const first = unitPopup.getByRole('button', {name: 'minutes', exact: true});
  54  |     await expect(first).toBeFocused(); await first.press('Shift+Tab'); await expect(unitPopup.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  55  |     await unitPopup.getByRole('button', {name: 'Cancel', exact: true}).press('Tab'); await expect(first).toBeFocused();
  56  |     await unitPopup.getByRole('button', {name: 'days', exact: true}).press('Enter'); await expect(unitPopup).toHaveCount(0); expect(s.writes).toEqual([]);
  57  |     await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  58  |     await expect(editor.getByRole('alert')).toContainText('Schedule save rejected'); await expect(toggle).toBeChecked();
  59  |     await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  60  |     await expect(toggle).toBeDisabled(); await expect.poll(s.pending).toBe(true); expect(s.writes).toHaveLength(2); s.release();
  61  |     await expect(editor.getByText('Automatic updates saved', {exact: true})).toBeVisible(); await expect(toggle).toBeEnabled();
  62  |     expect(s.writes).toEqual(Array(2).fill({p_task_key:'listening_history', p_enabled:true, p_interval_value:3, p_interval_unit:'days'}));
  63  |     await expectNoBlockingAxeViolations(page); await toggle.press('Space'); await editor.getByRole('button', {name: 'Back', exact: true}).press('Enter');
  64  |     await expect(list.locator('[data-task="listening_history"]')).toContainText('Every 3 days');
  65  |     await list.locator('a[data-task="listening_history"]').press('Enter'); await expect(toggle).toBeChecked();
> 66  |     expect(s.errors).toEqual([]); await writeFile(info.outputPath('update-workflow.json'), JSON.stringify({motion,height,writes:s.writes,errors:s.errors}, null, 2));
      |                      ^ Error: expect(received).toEqual(expected) // deep equality
  67  |   });
  68  | 
  69  |   test(`Updates responsive cards, fields and blurred popups (${motion}, height ${height})`, async ({page}, info) => {
  70  |     await page.emulateMedia({reducedMotion: motion}); const s = await setup(page); const samples = [];
  71  |     const widths = [320,360,390,760,767,768,1024,1440,1920];
  72  |     const list = page.locator('v2-settings-updates');
  73  |     for (const width of widths) {
  74  |       await page.setViewportSize({width,height}); await list.locator('a').first().click({trial:true});
  75  |       const sample = await list.evaluate(element => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
  76  |         cards:[...element.querySelectorAll('.v2-update-summary')].map(card => {const b=card.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,height:b.height};}),
  77  |         images:[...element.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};})}));
  78  |       expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.images.every(img=>img.loaded)).toBe(true);
  79  |       for(const card of sample.cards) {expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(width<768?68:88);}
  80  |       if(width>=768) for(let i=0;i<sample.cards.length;i+=2) {expect(sample.cards[i].height).toBe(sample.cards[i+1].height);expect(sample.cards[i].top).toBe(sample.cards[i+1].top);}
  81  |       samples.push(sample);
  82  |     }
  83  |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});
  84  |     await list.screenshot({path:info.outputPath('updates-list.png')});
  85  |     await list.locator('a[data-task="listening_history"]').click(); const editor=page.locator('v2-settings-update-editor');
  86  |     await expect(editor.getByRole('switch')).toBeVisible(); await editor.screenshot({path:info.outputPath('updates-editor.png')});
  87  |     await editor.getByRole('button',{name:'Every 2',exact:true}).click(); const dialog=page.getByRole('dialog',{name:'Every',exact:true});
  88  |     await expect(dialog.getByRole('spinbutton')).toBeFocused(); await dialog.screenshot({path:info.outputPath('updates-every.png')});
  89  |     for(const width of widths) {
  90  |       await page.setViewportSize({width,height}); await dialog.getByRole('button',{name:'Cancel',exact:true}).click({trial:true});
  91  |       const sample=await dialog.evaluate(element=>{const b=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,button')].map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,height:b.height,text:e.textContent};}); return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},blur:getComputedStyle(document.querySelector('.v2-interval-backdrop')!).backdropFilter,controls};});
  92  |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.box.left).toBeGreaterThanOrEqual(0);expect(sample.box.right).toBeLessThanOrEqual(width);
  93  |       expect(sample.box.top).toBeGreaterThanOrEqual(0);expect(sample.box.bottom).toBeLessThanOrEqual(height);expect(sample.box.width).toBe(Math.min(350,width-32));
  94  |       expect(sample.blur).toBe('blur(9px)');expect(sample.controls.at(-1)?.text).toBe('Cancel');
  95  |       expect(sample.controls.every(c=>c.height>=48&&c.left>=sample.box.left&&c.right<=sample.box.right)).toBe(true); samples.push(sample);
  96  |     }
  97  |     await expectNoBlockingAxeViolations(page); await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  98  |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});
  99  |     await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  100 |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});await expect(unit.getByRole('button',{name:'minutes',exact:true})).toBeFocused();
  101 |     await unit.screenshot({path:info.outputPath('updates-unit.png')}); await unit.getByRole('button',{name:'Cancel',exact:true}).click();
  102 |     expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);
  103 |     await writeFile(info.outputPath('update-geometry.json'),JSON.stringify({motion,height,samples,errors:s.errors},null,2));
  104 |   });
  105 | }
  106 | 
```