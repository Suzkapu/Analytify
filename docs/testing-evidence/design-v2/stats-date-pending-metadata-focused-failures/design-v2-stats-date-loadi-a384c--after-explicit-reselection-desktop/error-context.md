# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-date-loading.spec.ts >> ranking date unavailable stops render retries and recovers after explicit reselection
- Location: e2e/design-v2-stats-date-loading.spec.ts:10:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 2

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
          - text: Ranking date
          - combobox "Ranking date" [ref=f1e51] [cursor=pointer]:
            - option "Current"
            - option "Oct 4, 2026" [selected]
        - generic [ref=f1e52]:
          - text: Compare against
          - combobox "Compare against" [ref=f1e53] [cursor=pointer]:
            - option "Previous available date"
            - option "Oct 4, 2026" [disabled]
      - generic [ref=f1e54]:
        - group "Search rankings" [ref=f1e56]:
          - generic [ref=f1e58]:
            - generic [ref=f1e59]: Search songs or artists
            - generic [ref=f1e60]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e61]
          - button "Search past" [ref=f1e62] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e63]: 
            - text: Search past
        - generic "No top songs found" [ref=f1e64]:
          - status [ref=f1e65]:
            - generic [aria-hidden] [ref=f1e66]: 
            - heading "No top songs found" [level=2] [ref=f1e67]
            - paragraph [ref=f1e68]: Try another search, date, or ranking period.
  - text:   
  - contentinfo [ref=f1e69]:
    - generic [ref=f1e70]: Powered by Spotify
    - generic [ref=f1e71]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e72] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {writeFile} from 'node:fs/promises';
  2  | import {test,expect} from './fixtures';
  3  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  4  | 
  5  | const owner='de111111-1111-4111-8111-111111111111';
  6  | const snapshot='22222222-2222-4222-8222-222222222222';
  7  | const timestamp=new Date('2026-10-04T12:00:00Z').getTime();
  8  | 
  9  | for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  10 |   test(`${purpose} date ${outcome} stops render retries and recovers after explicit reselection`,async({page},testInfo)=>{
  11 |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  12 |     await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
  13 |     await page.evaluate(async({snapshot,timestamp})=>{
  14 |       await new Promise<void>((resolve,reject)=>{
  15 |         const request=indexedDB.open('AnalytifyDB',4);
  16 |         request.onerror=()=>reject(request.error);
  17 |         request.onsuccess=()=>{
  18 |           const db=request.result,tx=db.transaction(['statsHistory','featureData','appData'],'readwrite');
  19 |           for(const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({
  20 |             id:snapshot,userId,range:'short_term',timestamp,
  21 |             snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded:false
  22 |           });
  23 |           for(const userId of ['e2e-user','e2e-user_dev']) {
  24 |             const parts={tracks:[{id:'current-song',name:'Test Song',artists:[{name:'Test Artist'}],album:{images:[]}}],
  25 |               artists:[{id:'current-artist',name:'Test Artist',images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
  26 |             for(const [part,value] of Object.entries(parts)) tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
  27 |             tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now())});
  28 |           }
  29 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  30 |         };
  31 |       });
  32 |     },{snapshot,timestamp});
  33 |     const requests:URL[]=[];let recovered=false;
  34 |     await page.route('**/rest/v1/stats_snapshots**',async route=>{
  35 |       const url=new URL(route.request().url());
  36 |       if(!url.searchParams.has('id')) return route.fulfill({json:[]});
  37 |       requests.push(url);
  38 |       if(!recovered) return outcome==='failed'
  39 |         ? route.fulfill({status:503,json:{message:'Isolated saved-date failure'}})
  40 |         : route.fulfill({json:null});
  41 |       return route.fulfill({json:{id:snapshot,snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z',range:'short_term',
  42 |         stats_snapshot_tracks:[{rank:1,tracks:{id:'recovered-song',name:'Recovered song',duration_ms:180000,explicit:false,
  43 |           albums:{id:'saved-album',name:'Saved album',image_url:null},track_artists:[{artist_rank:0,artists:{id:'saved-artist',name:'Saved Artist'}}]}}],
  44 |         stats_snapshot_artists:[],stats_snapshot_genres:[]}});
  45 |     });
  46 |     await page.goto('/new/stats');
  47 |     const ranking=page.getByRole('combobox',{name:'Ranking date'});
  48 |     const comparison=page.getByRole('combobox',{name:'Compare against'});
  49 |     await expect(ranking.locator(`option[value="${timestamp}"]`)).toBeAttached();
  50 |     await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  51 |     const control=purpose==='ranking'?ranking:comparison;
  52 |     await control.selectOption(String(timestamp));
> 53 |     try {await expect.poll(()=>requests.length).toBe(1);}
     |                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  54 |     finally {
  55 |       const state=await page.evaluate(()=>{
  56 |         const host=document.querySelector('app-v2-user-stats');
  57 |         const component=(window as any).ng?.getComponent(host);
  58 |         return component?{context:component.snapshotDetailContext,unavailable:Array.from(component.unavailableSnapshotDetails),
  59 |           history:component.historyData,selected:component.selectedSnapshotId,compare:component.compareSnapshotId,range:component.selectedRange}:null;
  60 |       });
  61 |       const path=testInfo.outputPath('isolated-date-request-debug.json');
  62 |       await writeFile(path,JSON.stringify({requests:requests.map(u=>u.href),state},null,2));
  63 |       await testInfo.attach('isolated-date-request-debug',{path,contentType:'application/json'});
  64 |     }
  65 |     if(purpose==='ranking') await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  66 |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  67 |     const search=page.getByRole('searchbox',{name:'Search songs or artists'});
  68 |     for(const query of ['Saved','not found','']) {
  69 |       await search.fill(query);await expect(search).toHaveValue(query);
  70 |       if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  71 |     }
  72 |     expect(requests).toHaveLength(1);
  73 |     expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
  74 |     expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
  75 |     recovered=true;
  76 |     await control.selectOption(purpose==='ranking'?'current':'');
  77 |     await control.selectOption(String(timestamp));
  78 |     await expect.poll(()=>requests.length).toBe(2);
  79 |     if(purpose==='ranking') await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Recovered song'})).toBeVisible();
  80 |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  81 |     await expectNoBlockingAxeViolations(page);
  82 |     expect(requests).toHaveLength(2);
  83 |   });
  84 | }
  85 | 
```