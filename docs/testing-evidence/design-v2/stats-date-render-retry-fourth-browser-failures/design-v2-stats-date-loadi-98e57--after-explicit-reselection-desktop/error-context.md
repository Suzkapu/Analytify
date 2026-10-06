# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-date-loading.spec.ts >> comparison date failed stops render retries and recovers after explicit reselection
- Location: e2e/design-v2-stats-date-loading.spec.ts:9:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 6

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
            - option "Current" [selected]
            - option "Oct 4, 2026"
        - generic [ref=f1e52]:
          - text: Compare against
          - combobox "Compare against" [ref=f1e53] [cursor=pointer]:
            - option "Previous available date"
            - option "Oct 4, 2026" [selected]
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
        - generic [ref=f1e65]:
          - group "Rank 1. Unchanged" [ref=f1e66]:
            - generic [aria-hidden] [ref=f1e67]: "1"
            - generic [aria-hidden] [ref=f1e68]: —
          - button "Open Test Song on Spotify" [disabled] [ref=f1e69]:
            - img "Test Song cover" [ref=f1e70]
          - generic [ref=f1e71]:
            - strong [ref=f1e72]: Test Song
            - generic [ref=f1e73]: Test Artist
          - button "View position history for Test Song" [ref=f1e74] [cursor=pointer]: History
        - button " Create playlist" [ref=f1e75] [cursor=pointer]:
          - generic [ref=f1e76]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f1e77]:
    - generic [ref=f1e78]: Powered by Spotify
    - generic [ref=f1e79]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e80] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test,expect} from './fixtures';
  2  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | 
  4  | const owner='de111111-1111-4111-8111-111111111111';
  5  | const snapshot='22222222-2222-4222-8222-222222222222';
  6  | const timestamp=new Date('2026-10-04T12:00:00Z').getTime();
  7  | 
  8  | for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  9  |   test(`${purpose} date ${outcome} stops render retries and recovers after explicit reselection`,async({page})=>{
  10 |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  11 |     await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
  12 |     await page.evaluate(async({snapshot,timestamp})=>{
  13 |       await new Promise<void>((resolve,reject)=>{
  14 |         const request=indexedDB.open('AnalytifyDB',4);
  15 |         request.onerror=()=>reject(request.error);
  16 |         request.onsuccess=()=>{
  17 |           const db=request.result,tx=db.transaction(['statsHistory','featureData','appData'],'readwrite');
  18 |           for(const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({
  19 |             id:snapshot,userId,range:'short_term',timestamp,
  20 |             snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded:false
  21 |           });
  22 |           for(const userId of ['e2e-user','e2e-user_dev']) {
  23 |             const parts={tracks:[{id:'current-song',name:'Test Song',artists:[{name:'Test Artist'}],album:{images:[]}}],
  24 |               artists:[{id:'current-artist',name:'Test Artist',images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
  25 |             for(const [part,value] of Object.entries(parts)) tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
  26 |             tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now())});
  27 |           }
  28 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  29 |         };
  30 |       });
  31 |     },{snapshot,timestamp});
  32 |     const requests:URL[]=[];let recovered=false;
  33 |     await page.route('**/rest/v1/stats_snapshots**',async route=>{
  34 |       const url=new URL(route.request().url());
  35 |       if(!url.searchParams.has('id')) return route.fulfill({json:[]});
  36 |       requests.push(url);
  37 |       if(!recovered) return outcome==='failed'
  38 |         ? route.fulfill({status:503,json:{message:'Isolated saved-date failure'}})
  39 |         : route.fulfill({json:null});
  40 |       return route.fulfill({json:{id:snapshot,snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z',range:'short_term',
  41 |         stats_snapshot_tracks:[{rank:1,tracks:{id:'recovered-song',name:'Recovered song',duration_ms:180000,explicit:false,
  42 |           albums:{id:'saved-album',name:'Saved album',image_url:null},track_artists:[{artist_rank:0,artists:{id:'saved-artist',name:'Saved Artist'}}]}}],
  43 |         stats_snapshot_artists:[],stats_snapshot_genres:[]}});
  44 |     });
  45 |     await page.goto('/new/stats');
  46 |     const ranking=page.getByRole('combobox',{name:'Ranking date'});
  47 |     const comparison=page.getByRole('combobox',{name:'Compare against'});
  48 |     await expect(ranking.locator(`option[value="${timestamp}"]`)).toBeAttached();
  49 |     await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  50 |     const control=purpose==='ranking'?ranking:comparison;
  51 |     await control.selectOption(String(timestamp));
> 52 |     await expect.poll(()=>requests.length).toBe(1);
     |                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  53 |     if(purpose==='ranking') await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  54 |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  55 |     const search=page.getByRole('searchbox',{name:'Search songs or artists'});
  56 |     for(const query of ['Saved','not found','']) {
  57 |       await search.fill(query);await expect(search).toHaveValue(query);
  58 |       if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  59 |     }
  60 |     expect(requests).toHaveLength(1);
  61 |     expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
  62 |     expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
  63 |     recovered=true;
  64 |     await control.selectOption(purpose==='ranking'?'current':'');
  65 |     await control.selectOption(String(timestamp));
  66 |     await expect.poll(()=>requests.length).toBe(2);
  67 |     if(purpose==='ranking') await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Recovered song'})).toBeVisible();
  68 |     else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
  69 |     await expectNoBlockingAxeViolations(page);
  70 |     expect(requests).toHaveLength(2);
  71 |   });
  72 | }
  73 | 
```