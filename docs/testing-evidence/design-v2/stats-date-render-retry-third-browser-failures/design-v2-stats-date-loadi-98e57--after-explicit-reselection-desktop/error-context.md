# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-date-loading.spec.ts >> comparison date failed stops render retries and recovers after explicit reselection
- Location: e2e/design-v2-stats-date-loading.spec.ts:9:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.v2-ranked-song strong').filter({ hasText: 'Test Song' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.v2-ranked-song strong').filter({ hasText: 'Test Song' }) with timeout 5000ms
  - waiting for locator('.v2-ranked-song strong').filter({ hasText: 'Test Song' })

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
- main "Your Top Listening content":
  - paragraph: Personal listening
  - heading "Your top listening" [level=1]
  - paragraph: See top songs, artists, and genres, and how their rankings change.
  - group "Ranking category":
    - button "Songs" [pressed]
    - button "Artists"
    - button "Genres"
  - group "Statistics controls":
    - group "Ranking period":
      - button "4 weeks" [pressed]
      - button "6 months"
      - button "1 year"
    - text: Ranking date
    - combobox "Ranking date":
      - option "Current" [selected]
      - option "Oct 4, 2026"
    - text: Compare against
    - combobox "Compare against":
      - option "Previous available date"
      - option "Oct 4, 2026" [selected]
  - group "Search rankings":
    - text: Search songs or artists
    - searchbox "Search songs or artists"
    - button "Search past"
  - group "Rank 1. Unchanged"
  - button "Open Test Song on Spotify" [disabled]:
    - img "Test Song cover"
  - strong: Test Song
  - text: Test Artist
  - button "View position history for Test Song": History
  - button " Create playlist"
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
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
> 49 |     await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
     |                                                                                        ^ Error: expect(locator).toBeVisible() failed
  50 |     const control=purpose==='ranking'?ranking:comparison;
  51 |     await control.selectOption(String(timestamp));
  52 |     await expect.poll(()=>requests.length).toBe(1);
  53 |     if(purpose==='ranking') await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  54 |     else await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
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
  67 |     if(purpose==='ranking') await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Recovered song'})).toBeVisible();
  68 |     else await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
  69 |     await expectNoBlockingAxeViolations(page);
  70 |     expect(requests).toHaveLength(2);
  71 |   });
  72 | }
  73 | 
```