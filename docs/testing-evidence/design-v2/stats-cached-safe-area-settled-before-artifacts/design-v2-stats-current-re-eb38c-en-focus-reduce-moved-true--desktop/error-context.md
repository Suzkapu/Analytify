# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-refresh.spec.ts >> cached Stats failure preserves complete rows and recovers without duplicate requests or stolen focus (reduce, moved=true)
- Location: e2e/design-v2-stats-current-refresh.spec.ts:6:7

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    65

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
        - alert [ref=f1e74]:
          - heading "Could not refresh this range" [level=3] [ref=f1e75]
          - paragraph [ref=f1e76]: Your cached rankings are still visible. Retry to update them.
          - button "Retry" [ref=f1e78] [cursor=pointer]
        - region "Rankings" [ref=f1e79]:
          - heading "Top songs" [level=2] [ref=f1e80]
          - generic [ref=f1e82]:
            - group "Rank 1. Unchanged" [ref=f1e83]:
              - generic [aria-hidden] [ref=f1e84]: "1"
              - generic [aria-hidden] [ref=f1e85]: —
            - button "Open Cached song on Spotify" [disabled] [ref=f1e86]:
              - img "Cached song cover" [ref=f1e87]
            - generic [ref=f1e88]:
              - strong [ref=f1e89]: Cached song
              - generic [ref=f1e90]: Cached artist
            - button "View position history for Cached song" [ref=f1e91] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f1e93] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e94]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f1e95]:
    - generic [ref=f1e96]: Powered by Spotify
    - generic [ref=f1e97]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e98] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test,expect} from './fixtures';
  2  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | for(const motion of ['no-preference','reduce'] as const) for(const moveFocus of [false,true]) {
  6  |   test(`cached Stats failure preserves complete rows and recovers without duplicate requests or stolen focus (${motion}, moved=${moveFocus})`,async({page},info)=>{
  7  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));await page.emulateMedia({reducedMotion:motion});
  8  |     await mockSpotify(page);await seedAuthenticatedBrowser(page);
  9  |     await page.evaluate(async()=>{
  10 |       await new Promise<void>((resolve,reject)=>{
  11 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  12 |         request.onsuccess=()=>{
  13 |           const db=request.result,tx=db.transaction(['featureData','appData'],'readwrite');
  14 |           for(const userId of ['e2e-user','e2e-user_dev']){
  15 |             const parts={tracks:[{id:'cached-song',name:'Cached song',artists:[{name:'Cached artist'}],album:{images:[]}}],
  16 |               artists:[{id:'cached-artist',name:'Cached artist',genres:['pop'],images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
  17 |             for(const [part,value] of Object.entries(parts))tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
  18 |             tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now()-2*86400000)});
  19 |           }
  20 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  21 |         };
  22 |       });
  23 |     });
  24 |     let finishInitial!:()=>void,finishRetry!:()=>void;
  25 |     const initial=new Promise<void>(resolve=>finishInitial=resolve),retry=new Promise<void>(resolve=>finishRetry=resolve);
  26 |     let requests=0;
  27 |     await page.route('https://api.spotify.com/v1/me/top/artists?*',async route=>{
  28 |       requests++;
  29 |       if(requests===1){await initial;return route.fulfill({status:403,json:{error:{status:403,message:'Isolated stale-refresh failure'}}});}
  30 |       await retry;return route.fulfill({json:{items:[{id:'fresh-artist',name:'Fresh artist',genres:['pop'],images:[]}],total:1}});
  31 |     });
  32 |     await page.goto('/new/stats');const main=page.getByRole('main');
  33 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  34 |     await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
  35 |     await expect.poll(()=>requests).toBe(1);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refreshing.png')});
  36 |     finishInitial();await expect(main.getByRole('alert')).toBeVisible();
  37 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  38 |     await expect(main.getByText('Could not refresh this range',{exact:true})).toBeVisible();
  39 |     await expectNoBlockingAxeViolations(page);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refresh-failed.png')});
  40 |     const originalViewport=page.viewportSize()!;
  41 |     const safeAreaSamples=[];
  42 |     for(const width of [320,390,760,761])for(const height of [480,1080]){
  43 |       await page.setViewportSize({width,height});
  44 |       await expect.poll(()=>page.evaluate(()=>({width:innerWidth,height:innerHeight,compact:matchMedia('(max-width:760px)').matches}))).toEqual({width,height,compact:width<=760});
  45 |       await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});});
> 46 |       await expect.poll(()=>page.evaluate(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY))).toBeLessThanOrEqual(1);
     |                                                                                                                     ^ Error: expect(received).toBeLessThanOrEqual(expected)
  47 |       const action=main.getByRole('button',{name:'Create playlist from these songs',exact:true});
  48 |       await expect.poll(async()=>action.evaluate(el=>{
  49 |         const r=el.getBoundingClientRect(),nav=document.querySelector('.v2-mobile-nav')!;
  50 |         const navVisible=getComputedStyle(nav).display!=='none',n=nav.getBoundingClientRect();
  51 |         return r.top>=0&&r.bottom<=(navVisible?n.top:innerHeight)&&(!navVisible||(n.top>=0&&n.bottom<=innerHeight))
  52 |           &&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  53 |       })).toBe(true);
  54 |       const sample=await action.evaluate(el=>{
  55 |         const r=el.getBoundingClientRect(),nav=document.querySelector('.v2-mobile-nav')!,n=nav.getBoundingClientRect();
  56 |         return {width:innerWidth,height:innerHeight,action:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},
  57 |           navVisible:getComputedStyle(nav).display!=='none',navTop:n.top,navBottom:n.bottom,overflow:document.documentElement.scrollWidth-innerWidth,
  58 |           scrollEndGap:Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)};
  59 |       });
  60 |       expect(sample.navVisible).toBe(width<=760);expect(sample.action.left).toBeGreaterThanOrEqual(0);
  61 |       expect(sample.action.right).toBeLessThanOrEqual(width);expect(sample.overflow).toBe(0);safeAreaSamples.push(sample);
  62 |       await writeFile(info.outputPath('cached-action-safe-area.json'),JSON.stringify(safeAreaSamples,null,2));
  63 |       if(width===390&&height===480)await page.screenshot({path:info.outputPath('cached-scrolled-safe-area-390-480.png')});
  64 |     }
  65 |     await info.attach('cached-action-safe-area.json',{body:JSON.stringify(safeAreaSamples,null,2),contentType:'application/json'});
  66 |     await page.setViewportSize(originalViewport);
  67 |     await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  68 |     await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
  69 |     await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
  70 |     await expect(main.locator('v2-current-stats-feedback section')).toBeFocused();
  71 |     await expect.poll(()=>requests).toBe(2);
  72 |     const search=main.getByRole('searchbox');if(moveFocus)await search.focus();
  73 |     finishRetry();await expect(main.getByText('Test Song',{exact:true})).toBeVisible();
  74 |     await expect(main.getByText('Cached song',{exact:true})).toHaveCount(0);await expect(main.getByRole('alert')).toHaveCount(0);
  75 |     expect(requests).toBe(2);
  76 |     if(moveFocus)await expect(search).toBeFocused();else await expect(main.getByRole('heading',{name:'Top songs',exact:true})).toBeFocused();
  77 |     await expectNoBlockingAxeViolations(page);
  78 |   });
  79 | }
  80 | 
```