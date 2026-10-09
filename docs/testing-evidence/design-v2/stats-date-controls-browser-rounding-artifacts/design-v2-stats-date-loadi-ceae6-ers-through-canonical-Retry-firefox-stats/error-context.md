# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-date-loading.spec.ts >> ranking date unavailable stops render retries and recovers through canonical Retry
- Location: e2e/design-v2-stats-date-loading.spec.ts:11:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
    164,
-   48,
+   48.000030517578125,
  ]
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
  - main "Your Top Listening content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - paragraph [ref=f1e33]: Personal listening
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: See top songs, artists, and genres, and how their rankings change.
      - group "Ranking category" [ref=f1e38]:
        - button "Songs" [pressed] [ref=f1e39] [cursor=pointer]
        - button "Artists" [ref=f1e40] [cursor=pointer]
        - button "Genres" [ref=f1e41] [cursor=pointer]
      - group "Statistics controls" [ref=f1e44]:
        - group "Ranking period" [ref=f1e46]:
          - button "4 weeks" [pressed] [ref=f1e47] [cursor=pointer]
          - button "6 months" [ref=f1e48] [cursor=pointer]
          - button "1 year" [ref=f1e49] [cursor=pointer]
      - generic [ref=f1e50]:
        - group "Search rankings" [ref=f1e52]:
          - generic [ref=f1e54]:
            - generic [ref=f1e55]: Search songs or artists
            - generic [ref=f1e56]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e57]
          - button "Compare dates" [expanded] [active] [ref=f1e58] [cursor=pointer]
          - button "Search past" [ref=f1e60] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e61]: 
            - text: Search past
        - region "Ranking date comparison" [ref=f1e62]:
          - button "Ranking date" [ref=f1e64] [cursor=pointer]:
            - generic [ref=f1e66]: Today
          - button "Compare with" [ref=f1e68] [cursor=pointer]:
            - generic [ref=f1e70]: Oct 5, 2026
        - generic [ref=f1e72]:
          - group "Rank 1. New" [ref=f1e73]:
            - img "Top 10 debut" [ref=f1e75]
            - generic [aria-hidden] [ref=f1e77]: "1"
            - generic [aria-hidden] [ref=f1e78]: ✦
          - button "Open Test Song on Spotify" [disabled] [ref=f1e79]:
            - img "Test Song cover" [ref=f1e80]
          - generic [ref=f1e81]:
            - strong [ref=f1e82]: Test Song
            - generic [ref=f1e83]: Test Artist
          - button "View position history for Test Song" [ref=f1e84] [cursor=pointer]: History
        - button " Create playlist" [ref=f1e85] [cursor=pointer]:
          - generic [ref=f1e86]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f1e87]:
    - generic [ref=f1e88]: Powered by Spotify
    - generic [ref=f1e89]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e90] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {chooseStatsDate,showStatsDateControls} from './helpers/stats-calendar';
  2   | import {test,expect} from './fixtures';
  3   | import {writeFile} from 'node:fs/promises';
  4   | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  5   | 
  6   | const owner='de111111-1111-4111-8111-111111111111';
  7   | const snapshot='22222222-2222-4222-8222-222222222222';
  8   | const timestamp=new Date('2026-10-04T12:00:00Z').getTime();
  9   | 
  10  | for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  11  |   test(`${purpose} date ${outcome} stops render retries and recovers through canonical Retry`,async({page})=>{
  12  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  13  |     await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
  14  |     await page.evaluate(async({snapshot,timestamp})=>{
  15  |       await new Promise<void>((resolve,reject)=>{
  16  |         const request=indexedDB.open('AnalytifyDB',4);
  17  |         request.onerror=()=>reject(request.error);
  18  |         request.onsuccess=()=>{
  19  |           const db=request.result,tx=db.transaction(['statsHistory','featureData','appData'],'readwrite');
  20  |           for(const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({
  21  |             id:snapshot,userId,range:'short_term',timestamp,
  22  |             snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded:false
  23  |           });
  24  |           tx.objectStore('statsHistory').put({id:'33333333-3333-4333-8333-333333333333',userId:'e2e-user_dev',range:'short_term',
  25  |             timestamp:timestamp+86400000,snapshotDate:'2026-10-05',isLoaded:true,
  26  |             topTracks:[{id:'baseline-song',name:'Baseline song',artist:'Baseline Artist'}],topArtists:[],topGenres:[]});
  27  |           for(const userId of ['e2e-user','e2e-user_dev']) {
  28  |             const parts={tracks:[{id:'current-song',name:'Test Song',artists:[{name:'Test Artist'}],album:{images:[]}}],
  29  |               artists:[{id:'current-artist',name:'Test Artist',images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
  30  |             for(const [part,value] of Object.entries(parts)) tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
  31  |             tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now())});
  32  |           }
  33  |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  34  |         };
  35  |       });
  36  |     },{snapshot,timestamp});
  37  |     const requests:URL[]=[];let recovered=false;
  38  |     await page.route('**/rest/v1/stats_snapshots**',async route=>{
  39  |       const url=new URL(route.request().url());
  40  |       if(!url.searchParams.has('id')) return route.fulfill({json:[]});
  41  |       requests.push(url);
  42  |       if(!recovered) return outcome==='failed'
  43  |         ? route.fulfill({status:503,headers:{'Retry-After':'0','Access-Control-Expose-Headers':'Retry-After'},json:{message:'Isolated saved-date failure'}})
  44  |         : route.fulfill({json:null});
  45  |       return route.fulfill({json:{id:snapshot,snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z',range:'short_term',
  46  |         stats_snapshot_tracks:[{rank:1,tracks:{id:'recovered-song',name:'Recovered song',duration_ms:180000,explicit:false,
  47  |           albums:{id:'saved-album',name:'Saved album',image_url:null},track_artists:[{artist_rank:0,artists:{id:'saved-artist',name:'Saved Artist'}}]}}],
  48  |         stats_snapshot_artists:[],stats_snapshot_genres:[]}});
  49  |     });
  50  |     await page.goto('/new/stats');
  51  |     await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  52  |     expect(requests).toHaveLength(0);
  53  |     await showStatsDateControls(page);
  54  |     const fieldGeometry=await page.locator('#v2-stats-dates').evaluate(element=>{
  55  |       const rect=element.getBoundingClientRect();
  56  |       return {width:rect.width,gap:getComputedStyle(element).gap,
  57  |         fields:[...element.querySelectorAll('.date-field')].map(field=>{
  58  |           const bounds=field.getBoundingClientRect(), value=field.querySelector('.value')!.getBoundingClientRect();
  59  |           return {width:bounds.width,height:bounds.height,valueHeight:value.height};
  60  |         })};
  61  |     });
  62  |     expect(fieldGeometry.gap).toBe('12px');
  63  |     expect(fieldGeometry.fields).toHaveLength(2);
  64  |     expect(fieldGeometry.fields[0].width).toBe(fieldGeometry.fields[1].width);
  65  |     for(const field of fieldGeometry.fields) {expect(field.height).toBe(76);expect(field.valueHeight).toBe(48);}
  66  |     const action=page.getByRole('button',{name:'Compare dates',exact:true});
  67  |     const actionBounds=(await action.boundingBox())!;
> 68  |     expect([actionBounds.width,actionBounds.height]).toEqual([164,48]);
      |                                                      ^ Error: expect(received).toEqual(expected) // deep equality
  69  |     expect(await action.evaluate(element=>{const style=getComputedStyle(element);return [style.fontSize,style.fontWeight,style.lineHeight];})).toEqual(['14px','600','20px']);
  70  |     await action.screenshot({path:test.info().outputPath('snapshot-compare-dates-action.png')});
  71  |     const actionIcon=page.locator('.compare-dates img');
  72  |     await expect(actionIcon).toBeVisible();
  73  |     expect(await actionIcon.evaluate(element=>{const image=element as HTMLImageElement, bounds=image.getBoundingClientRect();return [image.complete,image.naturalWidth,image.naturalHeight,bounds.width,bounds.height];})).toEqual([true,20,20,20,20]);
  74  |     await writeFile(test.info().outputPath('snapshot-date-field-geometry.json'),JSON.stringify(fieldGeometry,null,2));
  75  |     await page.locator('#v2-stats-dates').screenshot({path:test.info().outputPath('snapshot-date-fields.png')});
  76  |     await chooseStatsDate(page,purpose,'2026-10-04');
  77  |     const failureAttempts=outcome==='failed'?4:1; // SDK permits three bounded 503 retries.
  78  |     await expect.poll(()=>requests.length,{timeout:15000}).toBe(failureAttempts);
  79  |     const feedback=page.locator('v2-snapshot-feedback');
  80  |     await expect(feedback.getByText(purpose==='ranking'?'Saved rankings unavailable':'Comparison unavailable',{exact:true})).toBeVisible();
  81  |     if(purpose==='ranking') await expect(page.locator('.v2-ranking-list')).toHaveCount(0);
  82  |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  83  |     const search=page.getByRole('searchbox',{name:'Search songs or artists'});
  84  |     for(const query of ['Saved','not found','']) {
  85  |       await search.fill(query);await expect(search).toHaveValue(query);
  86  |       if(purpose==='ranking') await expect(feedback.getByText('Saved rankings unavailable',{exact:true})).toBeVisible();
  87  |       else if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  88  |     }
  89  |     expect(requests).toHaveLength(failureAttempts);
  90  |     expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
  91  |     expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
  92  |     await expect(page.locator('.rank-movement, v2-ranking-flame')).toHaveCount(0);
  93  |     await feedback.getByRole('button',{name:'Choose date',exact:true}).click();
  94  |     const dialog=page.getByRole('dialog',{name:purpose==='ranking'?'VIEW SNAPSHOT':'COMPARE SNAPSHOT'});
  95  |     await expect(dialog).toBeVisible();
  96  |     const geometry=await dialog.evaluate(element=>{
  97  |       const bounds=element.getBoundingClientRect();
  98  |       const overlay=element.parentElement!;
  99  |       return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,viewport:{width:innerWidth,height:innerHeight},
  100 |         blur:getComputedStyle(overlay).backdropFilter,
  101 |         actions:[...element.querySelectorAll('footer button')].map(button=>button.textContent?.trim())};
  102 |     });
  103 |     expect(geometry.x).toBeGreaterThanOrEqual(16);
  104 |     expect(geometry.y).toBeGreaterThanOrEqual(16);
  105 |     expect(geometry.x+geometry.width).toBeLessThanOrEqual(geometry.viewport.width-16);
  106 |     expect(geometry.y+geometry.height).toBeLessThanOrEqual(geometry.viewport.height-16);
  107 |     expect(geometry.width).toBe(geometry.viewport.width<=760?288:356);
  108 |     expect(geometry.blur).toBe('blur(12px)');
  109 |     expect(geometry.actions.at(-1)).toBe('Close');
  110 |     const geometryPath=test.info().outputPath('snapshot-calendar-geometry.json');
  111 |     const screenshotPath=test.info().outputPath('snapshot-calendar.png');
  112 |     await writeFile(geometryPath,JSON.stringify(geometry,null,2));
  113 |     await dialog.screenshot({path:screenshotPath});
  114 |     await test.info().attach('snapshot-calendar-geometry',{path:geometryPath,contentType:'application/json'});
  115 |     await test.info().attach('snapshot-calendar',{path:screenshotPath,contentType:'image/png'});
  116 |     const resized=[];
  117 |     for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [400,1000]) {
  118 |       await page.setViewportSize({width,height});
  119 |       await expect.poll(async()=>Math.round((await dialog.boundingBox())!.width)).toBe(width<=760?288:356);
  120 |       const bounds=(await dialog.boundingBox())!;
  121 |       expect(bounds.x).toBeGreaterThanOrEqual(16);
  122 |       expect(bounds.y).toBeGreaterThanOrEqual(16);
  123 |       expect(bounds.x+bounds.width).toBeLessThanOrEqual(width-16);
  124 |       expect(bounds.y+bounds.height).toBeLessThanOrEqual(height-16);
  125 |       const close=dialog.getByRole('button',{name:'Close',exact:true});
  126 |       await expect(close).toBeInViewport();
  127 |       const closeBounds=(await close.boundingBox())!;
  128 |       expect(closeBounds.y+closeBounds.height).toBeLessThanOrEqual(bounds.y+bounds.height);
  129 |       expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  130 |       resized.push({viewport:{width,height},dialog:bounds,close:closeBounds});
  131 |     }
  132 |     await writeFile(test.info().outputPath('snapshot-calendar-resize.json'),JSON.stringify(resized,null,2));
  133 |     await page.setViewportSize(geometry.viewport);
  134 |     await expectNoBlockingAxeViolations(page);
  135 |     await dialog.getByRole('button',{name:'Close',exact:true}).focus();
  136 |     await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  137 |     await expect(feedback.getByRole('button',{name:'Choose date',exact:true})).toBeFocused();
  138 |     recovered=true;
  139 |     await feedback.getByRole('button',{name:'Retry',exact:true}).click();
  140 |     await expect.poll(()=>requests.length).toBe(failureAttempts+1);
  141 |     if(purpose==='ranking') await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Recovered song'})).toBeVisible();
  142 |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  143 |     await expectNoBlockingAxeViolations(page);
  144 |     expect(requests).toHaveLength(failureAttempts+1);
  145 |     for(const request of requests) {
  146 |       expect(request.searchParams.get('user_id')).toBe(`eq.${owner}`);
  147 |       expect(request.searchParams.get('id')).toBe(`eq.${snapshot}`);
  148 |     }
  149 |   });
  150 | }
  151 | 
```