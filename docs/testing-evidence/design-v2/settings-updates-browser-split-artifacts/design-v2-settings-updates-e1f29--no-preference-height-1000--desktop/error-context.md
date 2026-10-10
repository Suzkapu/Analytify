# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates popup draft and keyboard containment (no-preference, height 1000)
- Location: e2e/design-v2-settings-updates.spec.ts:57:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "AbortError: Transition was skipped. New ViewTransition started",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation "Main navigation" [ref=f1e11]:
        - link "Playlists" [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
        - link "Stats" [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
        - link "History" [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
      - generic [ref=f1e21]:
        - button "Open More tools" [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button "Open account and data settings" [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Automatic updates content" [active] [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - generic [ref=f1e33]:
          - heading "Listening history" [level=1] [ref=f1e34]
          - button "Back" [ref=f1e35] [cursor=pointer]
        - paragraph [ref=f1e36]: Edit this optional update. Required feature updates stay on.
      - region "Automatic update preference" [ref=f1e38]:
        - generic [ref=f1e40] [cursor=pointer]:
          - generic [ref=f1e41]:
            - strong [ref=f1e42]: Automatic updates
            - generic [ref=f1e43]: Update listening history in the background.
          - switch "Automatic updates" [ref=f1e45]
        - button "Every 2" [ref=f1e46] [cursor=pointer]:
          - strong [ref=f1e47]: Every
          - generic [ref=f1e48]: "2"
        - button "Unit hours" [ref=f1e49] [cursor=pointer]:
          - strong [ref=f1e50]: Unit
          - generic [ref=f1e51]: hours
        - status [ref=f1e53]:
          - strong [ref=f1e54]: "Minimum interval: 1 hour"
          - paragraph [ref=f1e55]: Choose an interval of 1 hour or longer.
        - button "Save changes" [ref=f1e56] [cursor=pointer]
        - paragraph [ref=f1e57]: Changes apply only after Save changes. Leaving through Back, Menu or any other navigation discards unsaved changes.
  - text:   
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
  9   |   await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  10  |   await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
  11  |   const errors: string[] = []; const expectedSaveFailures: string[] = []; const expectedReadFailures: string[] = []; const writes: Record<string, unknown>[] = [];
  12  |   page.on('pageerror', error => errors.push(error.message));
  13  |   page.on('console', message => {
  14  |     // The deliberately rejected first write produces a native HTTP-resource
  15  |     // diagnostic in Chromium. Only this exact exercised failure is expected.
  16  |     if (message.location().url.endsWith('/rpc/update_my_sync_schedule_preference') && /server responded with a status of 400/.test(message.text())) {
  17  |       expectedSaveFailures.push(message.text());
  18  |     } else if (message.location().url.endsWith('/rpc/get_my_sync_task_status') && /server responded with a status of 400/.test(message.text())) {
  19  |       expectedReadFailures.push(message.text());
  20  |     } else if (message.type() === 'error' || /DOM update timed out|Transition was aborted/.test(message.text())) errors.push(message.text());
  21  |   });
  22  |   const base = {optional_enabled: true, feature_required: false, effective_active: true, editable: true, reasons: [], interval_value: 7,
  23  |     interval_unit: 'days', minimum_interval_minutes: 10080, policy_available: true};
  24  |   let schedules = [
  25  |     {...base, task_key: 'listening_history', optional_enabled: false, effective_active: false, interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60},
  26  |     {...base, task_key: 'stats_short_term', interval_value: 24, interval_unit: 'hours', minimum_interval_minutes: 1440,
  27  |       feature_required: true, reasons: ['Required by your Song League']},
  28  |     {...base, task_key: 'stats_medium_term'}, {...base, task_key: 'stats_long_term'},
  29  |     {...base, task_key: 'song_league_playlists', editable: false, feature_required: true, reasons: ['Required by your Song Leagues']},
  30  |     {...base, task_key: 'shared_playlists', editable: false, effective_active: false, reasons: ['No shared Spotify copies need updates']}
  31  |   ];
  32  |   let failWrite = true; let release: (() => void) | null = null;
  33  |   let heldRead: Promise<void> | null = null; let readFailure = false;
  34  |   await page.route('**/rest/v1/rpc/get_my_sync_task_status', async route => {
  35  |     if (heldRead) {const pending = heldRead; heldRead = null; await pending;}
  36  |     if (readFailure) {readFailure = false; return route.fulfill({status:400,json:{message:'Schedule refresh unavailable'}});}
  37  |     await route.fulfill({json:schedules});
  38  |   });
  39  |   await page.route('**/rest/v1/rpc/update_my_sync_schedule_preference', async route => {
  40  |     const body = route.request().postDataJSON(); writes.push(body);
  41  |     if (failWrite) {failWrite = false; return route.fulfill({status: 400, json: {message: 'Schedule save rejected'}});}
  42  |     await new Promise<void>(resolve => {release = resolve;});
  43  |     schedules = schedules.map(row => row.task_key === body.p_task_key ? {...row, optional_enabled: body.p_enabled,
  44  |       effective_active: body.p_enabled, interval_value: body.p_interval_value, interval_unit: body.p_interval_unit} : row);
  45  |     await route.fulfill({json: null});
  46  |   });
  47  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/updates');
  48  |   await expect(page.locator('.v2-update-summary')).toHaveCount(6);
  49  |   await page.evaluate(async () => {await document.fonts.ready;});
  50  |   return {errors, expectedSaveFailures, expectedReadFailures, writes, release: () => release?.(), pending: () => !!release,
  51  |     holdRead: () => {let finish!: () => void; heldRead = new Promise(resolve => {finish=resolve;}); return finish;},
  52  |     failRead: () => {readFailure=true;}, empty: () => {schedules=[];},
  53  |     lockHistory: () => {schedules=schedules.map(row=>row.task_key==='listening_history'?{...row,feature_required:true}:row);}};
  54  | }
  55  | 
  56  | for (const motion of ['no-preference', 'reduce'] as const) for (const height of [480, 1000]) {
  57  |   test(`Updates popup draft and keyboard containment (${motion}, height ${height})`, async ({page}, info) => {
  58  |     await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
  59  |     const s=await setup(page);const list=page.locator('v2-settings-updates');
  60  |     await expect(list.locator('a.v2-update-summary')).toHaveCount(3);await expect(list.locator('[data-task="shared_playlists"]')).toContainText('Disabled');
  61  |     await list.locator('a[data-task="listening_history"]').press('Enter');const editor=page.locator('v2-settings-update-editor');
  62  |     const toggle=editor.getByRole('switch',{name:'Automatic updates'});await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
  63  |     const every=editor.getByRole('button',{name:'Every 2',exact:true});await every.click();
  64  |     const dialog=page.getByRole('dialog',{name:'Every',exact:true});const input=dialog.getByRole('spinbutton',{name:'Every'});
  65  |     await expect(input).toBeFocused();await input.fill('4');await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(every).toBeFocused();
  66  |     await every.press('Enter');await expect(input).toHaveValue('2');await input.fill('1.5');await dialog.getByRole('button',{name:'Apply'}).click();
  67  |     await expect(dialog.getByRole('alert')).toContainText('whole-number');await input.fill('3');await dialog.getByRole('button',{name:'Apply'}).click();
  68  |     await expect(editor.getByRole('button',{name:'Every 3',exact:true})).toBeFocused();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  69  |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});const first=unit.getByRole('button',{name:'minutes',exact:true});
  70  |     await expect(first).toBeFocused();await first.press('Shift+Tab');await expect(unit.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  71  |     await unit.getByRole('button',{name:'Cancel',exact:true}).press('Tab');await expect(first).toBeFocused();await unit.getByRole('button',{name:'days',exact:true}).press('Enter');
  72  |     await expect(unit).toHaveCount(0);expect(s.writes).toEqual([]);
  73  |     await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Disabled');
> 74  |     await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).not.toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
      |                                                                                                                                   ^ Error: expect(received).toEqual(expected) // deep equality
  75  |     await writeFile(info.outputPath('update-draft.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors},null,2));
  76  |   });
  77  |   test(`Updates explicit save, retry and authoritative readback (${motion}, height ${height})`, async ({page},info) => {
  78  |     await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height});
  79  |     const s=await setup(page);const list=page.locator('v2-settings-updates');await list.locator('a[data-task="listening_history"]').click();
  80  |     const editor=page.locator('v2-settings-update-editor');const toggle=editor.getByRole('switch',{name:'Automatic updates'});
  81  |     await expect(toggle).not.toBeChecked();await toggle.press('Space');await expect(toggle).toBeChecked();
  82  |     await editor.getByRole('button',{name:'Every 2',exact:true}).click();const every=page.getByRole('dialog',{name:'Every',exact:true});
  83  |     await every.getByRole('spinbutton').fill('3');await every.getByRole('button',{name:'Apply'}).click();
  84  |     await editor.getByRole('button',{name:'Unit hours',exact:true}).click();await page.getByRole('dialog',{name:'Unit',exact:true}).getByRole('button',{name:'days',exact:true}).click();
  85  |     expect(s.writes).toEqual([]);await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  86  |     await expect(editor.getByRole('alert')).toContainText('Schedule save rejected');await expect(toggle).toBeChecked();
  87  |     await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(toggle).toBeDisabled();await expect.poll(s.pending).toBe(true);
  88  |     expect(s.writes).toHaveLength(2);s.release();await expect(editor.getByText('Automatic updates saved',{exact:true})).toBeVisible();await expect(toggle).toBeEnabled();
  89  |     expect(s.writes).toEqual(Array(2).fill({p_task_key:'listening_history',p_enabled:true,p_interval_value:3,p_interval_unit:'days'}));
  90  |     await toggle.press('Space');await editor.getByRole('button',{name:'Back',exact:true}).press('Enter');await expect(list.locator('[data-task="listening_history"]')).toContainText('Every 3 days');
  91  |     await list.locator('a[data-task="listening_history"]').press('Enter');await expect(toggle).toBeChecked();expect(s.errors).toEqual([]);expect(s.expectedSaveFailures.length).toBeLessThanOrEqual(1);
  92  |     await writeFile(info.outputPath('update-workflow.json'),JSON.stringify({motion,height,writes:s.writes,errors:s.errors,expectedSaveFailures:s.expectedSaveFailures},null,2));
  93  |   });
  94  |   test(`Updates responsive cards and editor assets (${motion}, height ${height})`,async ({page},info)=>{
  95  |     await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];const list=page.locator('v2-settings-updates');
  96  |     for(const width of widths){
  97  |       await page.setViewportSize({width,height});await list.locator('a').first().click({trial:true});
  98  |       const sample=await list.evaluate(element=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
  99  |         cards:[...element.querySelectorAll('.v2-update-summary')].map(card=>{const b=card.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height};}),
  100 |         images:[...element.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};})}));
  101 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.images.every(img=>img.loaded)).toBe(true);
  102 |       for(const img of sample.images){const size=img.src?.endsWith('update-required.svg')?16:20;expect([img.width,img.height]).toEqual([size,size]);}
  103 |       for(const card of sample.cards){expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(width<768?68:88);}
  104 |       if(width>=768)for(let i=0;i<sample.cards.length;i+=2){expect(sample.cards[i].height).toBe(sample.cards[i+1].height);expect(sample.cards[i].top).toBe(sample.cards[i+1].top);}samples.push(sample);
  105 |     }
  106 |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await list.screenshot({path:info.outputPath('updates-list.png'),animations:'disabled'});
  107 |     await list.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await expect(editor.getByRole('switch')).toBeVisible();
  108 |     await editor.screenshot({path:info.outputPath('updates-editor.png'),animations:'disabled'});
  109 |     const images=await editor.locator('img').evaluateAll(elements=>elements.map(element=>{const img=element as HTMLImageElement;const b=img.getBoundingClientRect();return {src:img.getAttribute('src'),width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0};}));
  110 |     expect(images.map(img=>[img.width,img.height,img.loaded])).toEqual([[18,18,true],[20,20,true],[48,24,true],[20,20,true]]);
  111 |     await expectNoBlockingAxeViolations(page);expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  112 |     await writeFile(info.outputPath('update-card-geometry.json'),JSON.stringify({motion,height,samples,images,errors:s.errors},null,2));
  113 |   });
  114 |   test(`Updates popup resizing, blur and Cancel-last (${motion}, height ${height})`,async ({page},info)=>{
  115 |     await page.emulateMedia({reducedMotion:motion});const s=await setup(page);const samples=[];const widths=[320,360,390,760,767,768,1024,1440,1920];
  116 |     await page.locator('a[data-task="listening_history"]').click();const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();
  117 |     const dialog=page.getByRole('dialog',{name:'Every',exact:true});await expect(dialog.getByRole('spinbutton')).toBeFocused();
  118 |     for(const width of widths){
  119 |       await page.setViewportSize({width,height});await dialog.getByRole('button',{name:'Cancel',exact:true}).click({trial:true});
  120 |       const sample=await dialog.evaluate(element=>{const b=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,button')].map(e=>{const b=e.getBoundingClientRect();const css=getComputedStyle(e);return {left:b.left,right:b.right,height:b.height,text:e.textContent,fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight};});return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},blur:getComputedStyle(document.querySelector('.v2-interval-backdrop')!).backdropFilter,controls};});
  121 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);expect(sample.box.left).toBeGreaterThanOrEqual(0);expect(sample.box.right).toBeLessThanOrEqual(width);expect(sample.box.top).toBeGreaterThanOrEqual(0);expect(sample.box.bottom).toBeLessThanOrEqual(height);
  122 |       expect(sample.box.width).toBe(Math.min(350,width-32));expect(sample.blur).toBe('blur(9px)');expect(sample.controls.at(-1)?.text).toBe('Cancel');
  123 |       expect(sample.controls.every(c=>c.height>=48&&c.left>=sample.box.left&&c.right<=sample.box.right)).toBe(true);
  124 |       for(const button of sample.controls.slice(1))expect([button.fontSize,button.fontWeight,button.lineHeight]).toEqual(['14px','600','20px']);samples.push(sample);
  125 |     }
  126 |     await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await dialog.screenshot({path:info.outputPath('updates-every.png'),animations:'disabled'});
  127 |     await expectNoBlockingAxeViolations(page);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await editor.getByRole('button',{name:'Unit hours',exact:true}).click();
  128 |     const unit=page.getByRole('dialog',{name:'Unit',exact:true});await expect(unit.getByRole('button',{name:'minutes',exact:true})).toBeFocused();await unit.screenshot({path:info.outputPath('updates-unit.png'),animations:'disabled'});
  129 |     await unit.getByRole('button',{name:'Cancel',exact:true}).click();expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);
  130 |     await writeFile(info.outputPath('update-popup-geometry.json'),JSON.stringify({motion,height,samples,errors:s.errors},null,2));
  131 |   });
  132 | }
  133 | 
  134 | test('Updates cached refresh, recovery, policy lock and empty account',async ({page},info)=>{
  135 |   await page.setViewportSize({width:360,height:480});const s=await setup(page);const list=page.locator('v2-settings-updates');
  136 |   const finish=s.holdRead();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  137 |   await expect(list.getByText('Refreshing automatic updates',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  138 |   s.failRead();finish();await expect(list.getByRole('alert')).toContainText('Schedule refresh unavailable');await expect(list.locator('.v2-update-summary')).toHaveCount(6);
  139 |   await list.getByRole('button',{name:'Retry',exact:true}).click();await expect(list.getByRole('alert')).toHaveCount(0);await list.locator('a[data-task="listening_history"]').click();
  140 |   const editor=page.locator('v2-settings-update-editor');await editor.getByRole('button',{name:'Every 2',exact:true}).click();await expect(page.getByRole('dialog').getByRole('spinbutton')).toBeFocused();
  141 |   s.lockHistory();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('dialog')).toHaveCount(0);
  142 |   await expect(editor.getByRole('switch')).toHaveCount(0);await expect(editor.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);await expect(editor.getByText('This update is required',{exact:true})).toBeVisible();
  143 |   await editor.getByRole('button',{name:'Back',exact:true}).click();await expect(list.locator('.v2-update-summary')).toHaveCount(6);s.empty();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  144 |   await expect(list.getByText('No automatic updates available',{exact:true})).toBeVisible();await expect(list.locator('.v2-update-summary')).toHaveCount(0);await expectNoBlockingAxeViolations(page);
  145 |   expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);expect(s.expectedSaveFailures).toEqual([]);expect(s.expectedReadFailures.length).toBeLessThanOrEqual(1);
  146 |   await writeFile(info.outputPath('update-recovery.json'),JSON.stringify({writes:s.writes,errors:s.errors,expectedReadFailures:s.expectedReadFailures},null,2));
  147 | });
  148 | 
```