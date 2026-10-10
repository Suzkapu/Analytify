# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates explicit save, retry and authoritative readback (no-preference, height 1000)
- Location: e2e/design-v2-settings-updates.spec.ts:77:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: 'Unit', exact: true }).getByRole('button', { name: 'days', exact: true })
    - locator resolved to <button type="button" v2button="secondary" _ngcontent-ng-c1106910423="" class="v2-button v2-button--secondary">days</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e8]:
      - link [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation [ref=f1e11]:
        - link [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: Playlists
        - link [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
          - generic [ref=f1e17]: Stats
        - link [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
          - generic [ref=f1e20]: History
      - generic [ref=f1e21]:
        - button [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Automatic updates content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - generic [ref=f1e33]:
          - heading [level=1] [ref=f1e34]: Listening history
          - button [ref=f1e35] [cursor=pointer]: Back
        - paragraph [ref=f1e36]: Edit this optional update. Required feature updates stay on.
      - region "Automatic update preference" [ref=f1e38]:
        - generic [ref=f1e40] [cursor=pointer]:
          - generic [ref=f1e41]:
            - strong [ref=f1e42]: Automatic updates
            - generic [ref=f1e43]: Update listening history in the background.
          - switch [checked] [ref=f1e45]
        - button [aria-hidden] [ref=f1e46] [cursor=pointer]:
          - strong [ref=f1e47]: Every
          - generic [ref=f1e48]: "3"
        - button [aria-hidden] [ref=f1e49] [cursor=pointer]:
          - strong [ref=f1e50]: Unit
          - generic [ref=f1e51]: hours
        - status [ref=f1e53]:
          - strong [ref=f1e54]: "Minimum interval: 1 hour"
          - paragraph [ref=f1e55]: Choose an interval of 1 hour or longer.
        - button [aria-hidden] [ref=f1e56] [cursor=pointer]: Save changes
        - paragraph [aria-hidden] [ref=f1e57]: Changes apply only after Save changes. Leaving through Back, Menu or any other navigation discards unsaved changes.
        - dialog [ref=f1e61]:
          - heading "Unit" [level=2] [ref=f1e62]
          - paragraph [ref=f1e63]: Choose the unit for your interval. This changes only your unsaved draft.
          - button "minutes" [active] [ref=f1e64] [cursor=pointer]
          - button "hours" [ref=f1e65] [cursor=pointer]
          - button "days" [ref=f1e66] [cursor=pointer]
          - button "Cancel" [ref=f1e67] [cursor=pointer]
  - text:   
  - contentinfo [aria-hidden] [ref=f1e68]:
    - generic [ref=f1e69]: Powered by Spotify
    - generic [ref=f1e70]: Artwork and metadata belong to their owners.
    - link [ref=f1e71] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {Page} from '@playwright/test';
  3   | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  4   | import {writeFile} from 'node:fs/promises';
  5   | 
  6   | async function setup(page: Page) {
  7   |   // Observe native transition completion without altering its update callback,
  8   |   // animation, result or errors. Sequential workflow assertions need a settled
  9   |   // destination; observing its DOM alone does not mean its transition finished.
  10  |   await page.addInitScript(() => {
  11  |     const state = window as Window & {updatesActiveTransitions?: number}; state.updatesActiveTransitions=0;
  12  |     if (!document.startViewTransition) return;
  13  |     const start = document.startViewTransition.bind(document);
  14  |     document.startViewTransition = options => {
  15  |       const transition = start(options); state.updatesActiveTransitions!++;
  16  |       void transition.finished.then(() => {state.updatesActiveTransitions!--;}, () => {state.updatesActiveTransitions!--;});
  17  |       return transition;
  18  |     };
  19  |   });
  20  |   await mockSpotify(page); await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  21  |   await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
  22  |   await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  23  |   await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
  24  |   const errors: string[] = []; const expectedSaveFailures: string[] = []; const expectedReadFailures: string[] = []; const writes: Record<string, unknown>[] = [];
  25  |   page.on('pageerror', error => errors.push(error.message));
  26  |   page.on('console', message => {
  27  |     // The deliberately rejected first write produces a native HTTP-resource
  28  |     // diagnostic in Chromium. Only this exact exercised failure is expected.
  29  |     if (message.location().url.endsWith('/rpc/update_my_sync_schedule_preference') && /server responded with a status of 400/.test(message.text())) {
  30  |       expectedSaveFailures.push(message.text());
  31  |     } else if (message.location().url.endsWith('/rpc/get_my_sync_task_status') && /server responded with a status of 400/.test(message.text())) {
  32  |       expectedReadFailures.push(message.text());
  33  |     } else if (message.type() === 'error' || /DOM update timed out|Transition was aborted/.test(message.text())) errors.push(message.text());
  34  |   });
  35  |   const base = {optional_enabled: true, feature_required: false, effective_active: true, editable: true, reasons: [], interval_value: 7,
  36  |     interval_unit: 'days', minimum_interval_minutes: 10080, policy_available: true};
  37  |   let schedules = [
  38  |     {...base, task_key: 'listening_history', optional_enabled: false, effective_active: false, interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60},
  39  |     {...base, task_key: 'stats_short_term', interval_value: 24, interval_unit: 'hours', minimum_interval_minutes: 1440,
  40  |       feature_required: true, reasons: ['Required by your Song League']},
  41  |     {...base, task_key: 'stats_medium_term'}, {...base, task_key: 'stats_long_term'},
  42  |     {...base, task_key: 'song_league_playlists', editable: false, feature_required: true, reasons: ['Required by your Song Leagues']},
  43  |     {...base, task_key: 'shared_playlists', editable: false, effective_active: false, reasons: ['No shared Spotify copies need updates']}
  44  |   ];
  45  |   let failWrite = true; let release: (() => void) | null = null;
  46  |   let heldRead: Promise<void> | null = null; let readFailure = false;
  47  |   await page.route('**/rest/v1/rpc/get_my_sync_task_status', async route => {
  48  |     if (heldRead) {const pending = heldRead; heldRead = null; await pending;}
  49  |     if (readFailure) {readFailure = false; return route.fulfill({status:400,json:{message:'Schedule refresh unavailable'}});}
  50  |     await route.fulfill({json:schedules});
  51  |   });
  52  |   await page.route('**/rest/v1/rpc/update_my_sync_schedule_preference', async route => {
  53  |     const body = route.request().postDataJSON(); writes.push(body);
  54  |     if (failWrite) {failWrite = false; return route.fulfill({status: 400, json: {message: 'Schedule save rejected'}});}
  55  |     await new Promise<void>(resolve => {release = resolve;});
  56  |     schedules = schedules.map(row => row.task_key === body.p_task_key ? {...row, optional_enabled: body.p_enabled,
  57  |       effective_active: body.p_enabled, interval_value: body.p_interval_value, interval_unit: body.p_interval_unit} : row);
  58  |     await route.fulfill({json: null});
  59  |   });
  60  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/updates');
  61  |   await expect(page.locator('.v2-update-summary')).toHaveCount(6);
  62  |   await page.evaluate(async () => {await document.fonts.ready;});
  63  |   return {errors, expectedSaveFailures, expectedReadFailures, writes, release: () => release?.(), pending: () => !!release,
  64  |     holdRead: () => {let finish!: () => void; heldRead = new Promise(resolve => {finish=resolve;}); return finish;},
  65  |     failRead: () => {readFailure=true;}, empty: () => {schedules=[];},
  66  |     lockHistory: () => {schedules=schedules.map(row=>row.task_key==='listening_history'?{...row,feature_required:true}:row);}};
  67  | }
  68  | 
  69  | async function settledNavigation(page: Page): Promise<void> {
  70  |   await page.waitForFunction(() => (window as Window & {updatesActiveTransitions?: number}).updatesActiveTransitions === 0);
  71  | }
  72  | 
  73  | for (const motion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  74  |   test(`Updates popup draft and keyboard containment (${motion}, height ${height})`, async ({page}, info) => {
  75  |     await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
  76  |     const s=await setup(page);const list=page.locator('v2-settings-updates');
  77  |     await expect(list.locator('a.v2-update-summary')).toHaveCount(3);await expect(list.locator('[data-task="shared_playlists"]')).toContainText('Disabled');
  78  |     await list.locator('a[data-task="listening_history"]').press('Enter');const editor=page.locator('v2-settings-update-editor');
  79  |     const toggle=editor.getByRole('switch',{name:'Automatic updates'});await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
  80  |     const every=editor.getByRole('button',{name:'Every 2',exact:true});await every.click();
  81  |     const dialog=page.getByRole('dialog',{name:'Every',exact:true});const input=dialog.getByRole('spinbutton',{name:'Every'});
  82  |     await expect(input).toBeFocused();await input.fill('4');await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(every).toBeFocused();
  83  |     await every.press('Enter');await expect(input).toHaveValue('2');await input.fill('1.5');await dialog.getByRole('button',{name:'Apply'}).click();
> 84  |     await expect(dialog.getByRole('alert')).toContainText('whole-number');await input.fill('3');await dialog.getByRole('button',{name:'Apply'}).click();
      |                                                                                                                                                                                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
  85  |     await expect(editor.getByRole('button',{name:'Every 3',exact:true})).toBeFocused();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  86  |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});const first=unit.getByRole('button',{name:'minutes',exact:true});
  87  |     await expect(first).toBeFocused();await first.press('Shift+Tab');await expect(unit.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  88  |     await unit.getByRole('button',{name:'Cancel',exact:true}).press('Tab');await expect(first).toBeFocused();await unit.getByRole('button',{name:'days',exact:true}).press('Enter');
  89  |     await expect(unit).toHaveCount(0);expect(s.writes).toEqual([]);
  90  |     await settledNavigation(page);await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Disabled');await settledNavigation(page);
  91  |     await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).not.toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  92  |     await writeFile(info.outputPath('update-draft.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors},null,2));
  93  |   });
  94  |   test(`Updates explicit save, retry and authoritative readback (${motion}, height ${height})`, async ({page},info) => {
  95  |     await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
  96  |     const s=await setup(page);const list=page.locator('v2-settings-updates');await list.locator('a[data-task="listening_history"]').click();
  97  |     const editor=page.locator('v2-settings-update-editor');const toggle=editor.getByRole('switch',{name:'Automatic updates'});
  98  |     await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
  99  |     await editor.getByRole('button',{name:'Every 2',exact:true}).click();const every=page.getByRole('dialog',{name:'Every',exact:true});
  100 |     await every.getByRole('spinbutton').fill('3');await every.getByRole('button',{name:'Apply'}).click();
  101 |     await editor.getByRole('button',{name:'Unit hours',exact:true}).click();await page.getByRole('dialog',{name:'Unit',exact:true}).getByRole('button',{name:'days',exact:true}).click();
  102 |     expect(s.writes).toEqual([]);await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  103 |     await expect(editor.getByRole('alert')).toContainText('Schedule save rejected');await expect(toggle).toBeChecked();
  104 |     await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(toggle).toBeDisabled();await expect.poll(s.pending).toBe(true);
  105 |     expect(s.writes).toHaveLength(2);s.release();await expect(editor.getByText('Automatic updates saved',{exact:true})).toBeVisible();await expect(toggle).toBeEnabled();
  106 |     expect(s.writes).toEqual(Array(2).fill({p_task_key:'listening_history',p_enabled:true,p_interval_value:3,p_interval_unit:'days'}));
  107 |     await toggle.press('Space');await settledNavigation(page);await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Every 3 days');await settledNavigation(page);
  108 |     await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures.length).toBeLessThanOrEqual(1);
  109 |     await writeFile(info.outputPath('update-workflow.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors,expectedSaveFailures:s.expectedSaveFailures},null,2));
  110 |   });
  111 |   test(`Updates responsive cards and editor assets (${motion}, height ${height})`,async ({page},info)=>{
  112 |     await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];const list=page.locator('v2-settings-updates');
  113 |     for(const width of widths){
  114 |       await page.setViewportSize({width,height});await list.locator('a').first().click({trial:true});
  115 |       const sample=await list.evaluate(element=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
  116 |         cards:[...element.querySelectorAll('.v2-update-summary')].map(card=>{const b=card.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height};}),
  117 |         images:[...element.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};})}));
  118 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.images.every(img=>img.loaded)).toBe(true);
  119 |       for(const img of sample.images){const size=img.src?.endsWith('update-required.svg')?16:20;expect([img.width,img.height]).toEqual([size,size]);}
  120 |       for(const card of sample.cards){expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(width<768?68:88);}
  121 |       if(width>=768)for(let i=0;i<sample.cards.length;i+=2){expect(sample.cards[i].height).toBe(sample.cards[i+1].height);expect(sample.cards[i].top).toBe(sample.cards[i+1].top);}samples.push(sample);
  122 |     }
  123 |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await list.screenshot({path:info.outputPath('updates-list.png'),animations:'disabled'});
  124 |     await list.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await expect(editor.getByRole('switch')).toBeVisible();
  125 |     await editor.screenshot({path:info.outputPath('updates-editor.png'),animations:'disabled'});
  126 |     const images=await editor.locator('img').evaluateAll(elements=>elements.map(element=>{const img=element as HTMLImageElement;const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};}));
  127 |     expect(images.map(img=>[img.width,img.height,img.loaded])).toEqual([[18,18,true],[20,20,true],[48,24,true],[20,20,true]]);
  128 |     await expectNoBlockingAxeViolations(page);expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  129 |     await writeFile(info.outputPath('update-card-geometry.json'),JSON.stringify({motion,height,samples,images,errors:s.errors},null,2));
  130 |   });
  131 |   test(`Updates popup resizing, blur and Cancel-last (${motion}, height ${height})`,async ({page},info)=>{
  132 |     await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];
  133 |     await page.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();
  134 |     const dialog=page.getByRole('dialog',{name:'Every',exact:true});await expect(dialog.getByRole('spinbutton')).toBeFocused();
  135 |     for(const width of widths){
  136 |       await page.setViewportSize({width,height});await dialog.getByRole('button',{name:'Cancel',exact:true}).click({trial:true});
  137 |       const sample=await dialog.evaluate(element=>{const b=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,button')].map(e=>{const b=e.getBoundingClientRect();const css=getComputedStyle(e);return {left:b.left,right:b.right,height:b.height,text:e.textContent,fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight};});return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},blur:getComputedStyle(document.querySelector('.v2-interval-backdrop')!).backdropFilter,controls};});
  138 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.box.left).toBeGreaterThanOrEqual(0);expect(sample.box.right).toBeLessThanOrEqual(width);expect(sample.box.top).toBeGreaterThanOrEqual(0);expect(sample.box.bottom).toBeLessThanOrEqual(height);
  139 |       expect(sample.box.width).toBe(Math.min(350,width-32));expect(sample.blur).toBe('blur(9px)');expect(sample.controls.at(-1)?.text).toBe('Cancel');
  140 |       expect(sample.controls.every(c=>c.height>=48&&c.left>=sample.box.left&&c.right<=sample.box.right)).toBe(true);
  141 |       for(const button of sample.controls.slice(1))expect([button.fontSize,button.fontWeight,button.lineHeight]).toEqual(['14px','600','20px']);samples.push(sample);
  142 |     }
  143 |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await dialog.screenshot({path:info.outputPath('updates-every.png'),animations:'disabled'});
  144 |     await expectNoBlockingAxeViolations(page);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  145 |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});await expect(unit.getByRole('button',{name:'minutes',exact:true})).toBeFocused();await unit.screenshot({path:info.outputPath('updates-unit.png'),animations:'disabled'});
  146 |     await unit.getByRole('button',{name:'Cancel',exact:true}).click();expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  147 |     await writeFile(info.outputPath('update-popup-geometry.json'),JSON.stringify({motion,height,samples,errors:s.errors},null,2));
  148 |   });
  149 | }
  150 | 
  151 | test('Updates cached refresh, recovery, policy lock and empty account',async ({page},info)=>{
  152 |   await page.setViewportSize({width:360,height:480});const s=await setup(page);const list=page.locator('v2-settings-updates');
  153 |   const finish=s.holdRead();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  154 |   await expect(list.getByText('Refreshing automatic updates',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  155 |   s.failRead();finish();await expect(list.getByRole('alert')).toContainText('Schedule refresh unavailable');await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  156 |   await list.getByRole('button',{name:'Retry',exact:true}).click();await expect(list.getByRole('alert')).toHaveCount(0);await list.locator('a[data-task="listening_history"]').click();
  157 |   const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();await expect(page.getByRole('dialog').getByRole('spinbutton')).toBeFocused();
  158 |   s.lockHistory();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('dialog')).toHaveCount(0);
  159 |   await expect(editor.getByRole('switch')).toHaveCount(0);await expect(editor.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);await expect(editor.getByText('This update is required',{exact:true})).toBeVisible();
  160 |   await editor.getByRole('button',{name:'Back',exact:true}).click();await expect(list.locator('.v2-update-summary')).toHaveCount(6);s.empty();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  161 |   await expect(list.getByText('No automatic updates available',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(0);await expectNoBlockingAxeViolations(page);
  162 |   expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);expect(s.expectedReadFailures.length).toBeLessThanOrEqual(1);
  163 |   await writeFile(info.outputPath('update-recovery.json'),JSON.stringify({writes:s.writes,errors:s.errors,expectedReadFailures:s.expectedReadFailures},null,2));
  164 | });
  165 | 
```