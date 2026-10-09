# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-refresh.spec.ts >> cached Stats failure preserves complete rows and recovers without duplicate requests or stolen focus (no-preference, moved=true)
- Location: e2e/design-v2-stats-current-refresh.spec.ts:5:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0
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
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f1e36]:
        - region "Statistics controls" [ref=f1e37]:
          - generic [ref=f1e38]:
            - paragraph [ref=f1e39]: Period
            - group "Ranking period" [ref=f1e40]:
              - button "4 weeks" [pressed] [ref=f1e41] [cursor=pointer]
              - button "6 months" [ref=f1e43] [cursor=pointer]
              - button "1 year" [ref=f1e45] [cursor=pointer]
          - generic [ref=f1e47]:
            - paragraph [ref=f1e48]: Category
            - group "Ranking category" [ref=f1e49]:
              - button "Songs" [pressed] [ref=f1e50] [cursor=pointer]
              - button "Artists" [ref=f1e53] [cursor=pointer]
              - button "Genres" [ref=f1e56] [cursor=pointer]
        - group "Search rankings" [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search songs or artists
            - generic [ref=f1e64]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e65]
          - button "Compare dates" [ref=f1e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e69] [cursor=pointer]
        - status [ref=f1e74]:
          - paragraph [ref=f1e75]:
            - generic [ref=f1e77]: Refreshing this range… Your cached rankings stay visible.
        - region "Rankings" [ref=f1e78]:
          - heading "Top songs" [level=2] [ref=f1e79]
          - generic [ref=f1e81]:
            - group "Rank 1. Unchanged" [ref=f1e82]:
              - generic [aria-hidden] [ref=f1e83]: "1"
              - generic [aria-hidden] [ref=f1e84]: —
            - button "Open Cached song on Spotify" [disabled] [ref=f1e85]:
              - img "Cached song cover" [ref=f1e86]
            - generic [ref=f1e87]:
              - strong [ref=f1e88]: Cached song
              - generic [ref=f1e89]: Cached artist
            - button "View position history for Cached song" [ref=f1e90] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f1e92] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e93]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f1e94]:
    - generic [ref=f1e95]: Powered by Spotify
    - generic [ref=f1e96]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e97] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test,expect} from './fixtures';
  2  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | 
  4  | for(const motion of ['no-preference','reduce'] as const) for(const moveFocus of [false,true]) {
  5  |   test(`cached Stats failure preserves complete rows and recovers without duplicate requests or stolen focus (${motion}, moved=${moveFocus})`,async({page},info)=>{
  6  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));await page.emulateMedia({reducedMotion:motion});
  7  |     await mockSpotify(page);await seedAuthenticatedBrowser(page);
  8  |     await page.evaluate(async()=>{
  9  |       await new Promise<void>((resolve,reject)=>{
  10 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  11 |         request.onsuccess=()=>{
  12 |           const db=request.result,tx=db.transaction(['featureData','appData'],'readwrite');
  13 |           for(const userId of ['e2e-user','e2e-user_dev']){
  14 |             const parts={tracks:[{id:'cached-song',name:'Cached song',artists:[{name:'Cached artist'}],album:{images:[]}}],
  15 |               artists:[{id:'cached-artist',name:'Cached artist',genres:['pop'],images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
  16 |             for(const [part,value] of Object.entries(parts))tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
  17 |             tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now()-2*86400000)});
  18 |           }
  19 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  20 |         };
  21 |       });
  22 |     });
  23 |     let finishInitial!:()=>void,finishRetry!:()=>void;
  24 |     const initial=new Promise<void>(resolve=>finishInitial=resolve),retry=new Promise<void>(resolve=>finishRetry=resolve);
  25 |     let requests=0;
  26 |     await page.route('https://api.spotify.com/v1/me/top/artists?*',async route=>{
  27 |       requests++;
  28 |       if(requests===1){await initial;return route.fulfill({status:403,json:{error:{status:403,message:'Isolated stale-refresh failure'}}});}
  29 |       await retry;return route.fulfill({json:{items:[{id:'fresh-artist',name:'Fresh artist',genres:['pop'],images:[]}],total:1}});
  30 |     });
  31 |     await page.goto('/new/stats');const main=page.getByRole('main');
  32 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  33 |     await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
> 34 |     expect(requests).toBe(1);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refreshing.png')});
     |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  35 |     finishInitial();await expect(main.getByRole('alert')).toBeVisible();
  36 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  37 |     await expect(main.getByText('Could not refresh this range',{exact:true})).toBeVisible();
  38 |     await expectNoBlockingAxeViolations(page);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refresh-failed.png')});
  39 |     await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  40 |     await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
  41 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  42 |     await expect(main.locator('v2-current-stats-feedback section')).toBeFocused();
  43 |     await expect.poll(()=>requests).toBe(2);
  44 |     const search=main.getByRole('searchbox');if(moveFocus)await search.focus();
  45 |     finishRetry();await expect(main.getByText('Test Song',{exact:true})).toBeVisible();
  46 |     await expect(main.getByText('Cached song',{exact:true})).toHaveCount(0);await expect(main.getByRole('alert')).toHaveCount(0);
  47 |     expect(requests).toBe(2);
  48 |     if(moveFocus)await expect(search).toBeFocused();else await expect(main.getByRole('heading',{name:'Top songs',exact:true})).toBeFocused();
  49 |     await expectNoBlockingAxeViolations(page);
  50 |   });
  51 | }
  52 | 
```