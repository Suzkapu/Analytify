# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates Retry scroll target clears fixed mobile navigation
- Location: e2e/design-v2-settings-updates.spec.ts:168:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Settings
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Settings content" [ref=f1e17]:
    - generic "Settings" [ref=f1e19]:
      - generic [ref=f1e20]:
        - heading "Settings" [level=1] [ref=f1e24]
        - navigation "Settings sections" [ref=f1e27]:
          - link "Account" [ref=f1e28] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Notifications" [ref=f1e31] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e32]: 
            - generic [ref=f1e33]: Alerts
          - link "Updates" [ref=f1e34] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e35]: 
          - link "Data" [ref=f1e37] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e38]: 
          - link "Navigation" [ref=f1e40] [cursor=pointer]:
            - /url: /new/settings/navigation
            - generic [aria-hidden] [ref=f1e41]: 
        - region "Automatic update settings" [ref=f1e45]:
          - generic "Automatic updates could not be loaded" [ref=f1e46]:
            - alert [ref=f1e47]:
              - strong [ref=f1e48]: Automatic updates could not be loaded
              - paragraph [ref=f1e49]: Schedule refresh unavailable
              - button "Retry" [ref=f1e50] [cursor=pointer]
          - generic [ref=f1e51]:
            - link "Listening history Disabled Update when you choose to enable it" [ref=f1e52] [cursor=pointer]:
              - /url: /new/settings/updates/listening_history
              - generic [ref=f1e53]:
                - strong [ref=f1e54]: Listening history
                - generic [ref=f1e55]: Disabled
              - paragraph [ref=f1e56]: Update when you choose to enable it
            - article [ref=f1e57]:
              - generic [ref=f1e58]:
                - strong [ref=f1e59]: Short-term stats
                - generic [ref=f1e60]: Required
              - paragraph [ref=f1e61]: Every 24 hours
              - paragraph [ref=f1e62]: Required by your Song League
            - link "Medium-term stats Active Every 7 days" [ref=f1e63] [cursor=pointer]:
              - /url: /new/settings/updates/stats_medium_term
              - generic [ref=f1e64]:
                - strong [ref=f1e65]: Medium-term stats
                - generic [ref=f1e66]: Active
              - paragraph [ref=f1e67]: Every 7 days
            - link "Long-term stats Active Every 7 days" [ref=f1e68] [cursor=pointer]:
              - /url: /new/settings/updates/stats_long_term
              - generic [ref=f1e69]:
                - strong [ref=f1e70]: Long-term stats
                - generic [ref=f1e71]: Active
              - paragraph [ref=f1e72]: Every 7 days
            - article [ref=f1e73]:
              - generic [ref=f1e74]:
                - strong [ref=f1e75]: Weekly league playlists
                - generic [ref=f1e76]: Required
              - paragraph [ref=f1e77]: Every 7 days
              - paragraph [ref=f1e78]: Required by your Song Leagues
            - article [ref=f1e79]:
              - generic [ref=f1e80]:
                - strong [ref=f1e81]: Shared playlists
                - generic [ref=f1e82]: Disabled
              - paragraph [ref=f1e83]: Every 7 days
              - paragraph [ref=f1e84]: No shared Spotify copies need updates
          - paragraph [ref=f1e85]: Required updates stay on while you use the associated feature.
  - navigation "Primary navigation" [ref=f1e86]:
    - link "Playlists" [ref=f1e87] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e88]: 
    - link "Stats" [ref=f1e90] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e91]: 
    - link "History" [ref=f1e93] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e94]: 
  - contentinfo [ref=f1e96]:
    - generic [ref=f1e97]: Powered by Spotify
    - generic [ref=f1e98]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e99] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  81  |     const dialog=page.getByRole('dialog',{name:'Every',exact:true});const input=dialog.getByRole('spinbutton',{name:'Every'});
  82  |     await expect(input).toBeFocused();await input.fill('4');await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(every).toBeFocused();
  83  |     await every.press('Enter');await expect(input).toHaveValue('2');await input.fill('1.5');await dialog.getByRole('button',{name:'Apply'}).click();
  84  |     await expect(dialog.getByRole('alert')).toContainText('whole-number');await input.fill('3');await dialog.getByRole('button',{name:'Apply'}).click();
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
  166 | // Fixed navigation must leave a reachable pointer target after native scrolling;
  167 | // document-bottom padding alone does not protect controls in the middle of a page.
  168 | test('Updates Retry scroll target clears fixed mobile navigation', async ({page}, info) => {
  169 |   await page.setViewportSize({width:360,height:480});
  170 |   const s=await setup(page);await settledNavigation(page);s.failRead();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  171 |   const list=page.locator('v2-settings-updates');await expect(list.getByRole('alert')).toContainText('Schedule refresh unavailable');
  172 |   const retry=list.getByRole('button',{name:'Retry',exact:true});
  173 |   await retry.evaluate(element=>element.scrollIntoView({block:'end',behavior:'instant'}));
  174 |   const geometry=await retry.evaluate(element=>{
  175 |     const b=element.getBoundingClientRect();const nav=document.querySelector('.v2-mobile-nav')!.getBoundingClientRect();
  176 |     const target=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  177 |     return {buttonBottom:b.bottom,navigationTop:nav.top,receivesPointer:!!target&&element.contains(target),interceptor:target?.tagName,activeTransitions:(window as Window & {updatesActiveTransitions?: number}).updatesActiveTransitions};
  178 |   });
  179 |   await writeFile(info.outputPath('update-retry-scroll.json'),JSON.stringify(geometry,null,2));
  180 |   expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.navigationTop);
> 181 |   expect(geometry.receivesPointer).toBe(true);
      |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  182 |   await retry.click();await expect(list.getByRole('alert')).toHaveCount(0);
  183 |   expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);
  184 | });
  185 | 
```